import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useFormContext, useFormState, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { CLIENT_STALE_TIME, clientKeys, getClient } from '@/entities/client'
import { LocationFields } from '@/entities/location'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { FieldError, FieldLegend, FieldSet } from '@/shared/ui/field'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'

import {
  newLocation,
  type QuickJobDefinitions,
  type QuickJobFormValues,
  type QuickJobValues,
} from '../model/schema'
import { CustomFieldsBlock } from './form-parts'

/** Where the job is: one of the client's locations, or a new one. */
export function LocationPicker({ definitions }: { definitions: QuickJobDefinitions }) {
  const { t } = useTranslation()
  const client = useWatch<QuickJobFormValues, 'client'>({ name: 'client' })

  if (client.kind === 'new') return <NewLocation definitions={definitions} />
  if (!client.clientId) {
    return <p className="text-sm text-muted-foreground">{t('job.create.clientFirst')}</p>
  }
  return <ClientLocations clientId={client.clientId} definitions={definitions} />
}

function NewLocation({ definitions }: { definitions: QuickJobDefinitions }) {
  return (
    <div className="space-y-4">
      <LocationFields name="location" />
      <CustomFieldsBlock definitions={definitions.location} name="location.customFields" />
    </div>
  )
}

function ClientLocations({
  clientId,
  definitions,
}: {
  clientId: string
  definitions: QuickJobDefinitions
}) {
  const { t } = useTranslation()
  const { locale } = useTenantFormat()
  const { setValue, formState } = useFormContext<QuickJobFormValues, unknown, QuickJobValues>()
  const { errors } = useFormState<QuickJobFormValues>({ name: 'location' })
  const location = useWatch<QuickJobFormValues, 'location'>({ name: 'location' })
  const client = useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async ({ signal }) => {
      return getClient(clientId, signal)
    },
    staleTime: CLIENT_STALE_TIME,
  })
  const locations = client.data?.locations ?? []
  const only = locations.length === 1 ? locations[0] : undefined
  const unchosen = location.kind === 'existing' && !location.locationId

  // The only location is the obvious choice
  useEffect(() => {
    if (only && unchosen) setValue('location', { kind: 'existing', locationId: only.id })
  }, [only, unchosen, setValue])

  if (client.isPending) return <Skeleton className="h-16" />

  const choose = (locationId: string) => {
    setValue(
      'location',
      { kind: 'existing', locationId },
      { shouldValidate: formState.isSubmitted },
    )
    setValue('assetId', '')
  }
  const chosen = location.kind === 'existing' ? location.locationId : null
  const assets = locations.find((candidate) => candidate.id === chosen)?.assets ?? []
  const error =
    location.kind === 'existing'
      ? (errors.location as { locationId?: { message?: string } } | undefined)?.locationId?.message
      : undefined

  return (
    <div className="space-y-4">
      <FieldSet>
        <FieldLegend variant="label" className="sr-only">
          {t('job.create.locationSection')}
        </FieldLegend>
        <div className="space-y-2">
          {locations.map((candidate) => (
            <label
              key={candidate.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5"
            >
              <input
                type="radio"
                name="quick-job-location"
                className="mt-0.5 accent-primary"
                checked={chosen === candidate.id}
                onChange={() => {
                  choose(candidate.id)
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium">{candidate.address}</span>
                {candidate.label && (
                  <span className="block text-muted-foreground">{candidate.label}</span>
                )}
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-primary/5">
            <input
              type="radio"
              name="quick-job-location"
              className="accent-primary"
              checked={location.kind === 'new'}
              onChange={() => {
                setValue('location', newLocation(definitions, { locale }))
                setValue('assetId', '')
              }}
            />
            <span className="font-medium">{t('job.create.newLocation')}</span>
          </label>
        </div>
        {error && <FieldError role="alert">{error}</FieldError>}
      </FieldSet>

      {location.kind === 'new' && <NewLocation definitions={definitions} />}

      {assets.length > 0 && (
        <SelectField
          name="assetId"
          label={t('job.create.asset')}
          emptyLabel={t('job.create.noAsset')}
          className="max-w-md"
          options={assets.map((asset) => ({
            value: asset.id,
            label: [asset.assetType.name, asset.manufacturer, asset.model, asset.serialNo]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
      )}
    </div>
  )
}
