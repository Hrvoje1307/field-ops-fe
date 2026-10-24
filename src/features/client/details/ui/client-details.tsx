import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'

import { type Asset, AssetSummary } from '@/entities/asset'
import {
  type Client,
  CLIENT_STALE_TIME,
  clientKeys,
  ContactLine,
  getClient,
} from '@/entities/client'
import { AccessCodes, AccessNotes, type Location, MapsLink } from '@/entities/location'
import { ApiError } from '@/shared/api/api-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { CustomFieldValuesFor } from './custom-field-values-for'

/** Actions and related blocks the caller puts into the client page. */
export interface ClientDetailsSlots {
  /** Next to the name, e.g. edit and delete. */
  actions?: ReactNode
  addLocation?: ReactNode
  locationActions?: (location: Location) => ReactNode
  addAsset?: (location: Location) => ReactNode
  assetActions?: (asset: Asset) => ReactNode
  /** The client's jobs, with a "new job" action. */
  jobs?: ReactNode
}

/**
 * One client for the office: contacts, details and custom fields, each location with
 * maps, access notes and codes (masked until revealed), its fields and equipment.
 */
export function ClientDetails({ clientId, ...slots }: { clientId: string } & ClientDetailsSlots) {
  const { t } = useTranslation()
  const client = useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async ({ signal }) => {
      return getClient(clientId, signal)
    },
    staleTime: CLIENT_STALE_TIME,
  })

  if (client.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (client.isError) {
    if (client.error instanceof ApiError && client.error.status === 404) {
      return <ClientNotFound />
    }
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('client.detail.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void client.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <Details client={client.data} {...slots} />
}

function Details({ client, ...slots }: { client: Client } & ClientDetailsSlots) {
  const { t } = useTranslation()
  const contacts = [...client.contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))

  return (
    <div className="space-y-6">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('client.detail.back')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t(`client.type.${client.type}`)}
            {client.oib && ` · ${t('client.oib')} ${client.oib}`}
          </p>
        </div>
        {slots.actions && <div className="flex flex-wrap gap-2">{slots.actions}</div>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t('client.detail.locations')}</h2>
            {slots.addLocation}
          </div>
          {client.locations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('client.detail.noLocations')}</p>
          ) : (
            client.locations.map((location) => (
              <LocationCard key={location.id} location={location} {...slots} />
            ))
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Block title={t('client.detail.contacts')}>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('client.detail.noContacts')}</p>
            ) : (
              <ul className="space-y-2">
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <ContactLine contact={contact} />
                    <span className="text-xs text-muted-foreground">
                      {[
                        contact.isPrimary && contacts.length > 1
                          ? t('client.detail.primary')
                          : null,
                        contact.receivesSms ? null : t('client.detail.noSms'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {client.email && (
              <p className="text-sm">
                <span className="text-muted-foreground">{t('client.email')}: </span>
                <a href={`mailto:${client.email}`} className="underline-offset-4 hover:underline">
                  {client.email}
                </a>
              </p>
            )}
            {client.notes && (
              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">{t('client.notes')}</p>
                <p className="whitespace-pre-line">{client.notes}</p>
              </div>
            )}
          </Block>
          <CustomFieldValuesFor
            scope={{ entity: 'client' }}
            values={client.customFields}
            title={t('client.detail.customFields')}
            className="space-y-3 rounded-xl border p-4"
          />
          {slots.jobs && <Block title={t('client.detail.jobs')}>{slots.jobs}</Block>}
        </div>
      </div>
    </div>
  )
}

function LocationCard({ location, ...slots }: { location: Location } & ClientDetailsSlots) {
  const { t } = useTranslation()
  const id = useId()
  const place = { address: location.address ?? '', lat: location.lat, lng: location.lng }
  const assets = location.assets ?? []

  return (
    <section
      aria-labelledby={id}
      className="space-y-4 rounded-xl border p-4"
      data-testid="location-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 id={id} className="font-semibold">
            {location.address}
          </h3>
          {location.label && <p className="text-sm text-muted-foreground">{location.label}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <MapsLink place={place} />
            <MapsLink place={place} directions />
          </div>
        </div>
        {slots.locationActions && (
          <div className="flex flex-wrap gap-2">{slots.locationActions(location)}</div>
        )}
      </div>
      {(Boolean(location.accessNotes?.trim()) || location.hasAccessCodes === true) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {Boolean(location.accessNotes?.trim()) && (
            <>
              <dt className="text-muted-foreground">{t('location.accessNotes')}</dt>
              <dd>
                <AccessNotes notes={location.accessNotes} />
              </dd>
            </>
          )}
          {location.hasAccessCodes && (
            <>
              <dt className="text-muted-foreground">{t('location.accessCodes')}</dt>
              <dd>
                <AccessCodes location={location} />
              </dd>
            </>
          )}
        </dl>
      )}
      <CustomFieldValuesFor scope={{ entity: 'location' }} values={location.customFields} />

      <div className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{t('client.detail.assets')}</h4>
          {slots.addAsset?.(location)}
        </div>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('client.detail.noAssets')}</p>
        ) : (
          <ul className="space-y-2">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="space-y-2 rounded-lg bg-muted/40 p-3"
                data-testid="asset-item"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <AssetSummary asset={asset} />
                  {slots.assetActions && (
                    <div className="flex flex-wrap gap-2">{slots.assetActions(asset)}</div>
                  )}
                </div>
                <CustomFieldValuesFor
                  scope={{ entity: 'asset', assetTypeId: asset.assetTypeId }}
                  values={asset.customFields}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function ClientNotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-xl space-y-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t('client.detail.notFound')}</h1>
      <p className="text-muted-foreground">{t('client.detail.notFoundDescription')}</p>
      <Button asChild variant="outline">
        <Link to="/clients">{t('client.detail.back')}</Link>
      </Button>
    </div>
  )
}
