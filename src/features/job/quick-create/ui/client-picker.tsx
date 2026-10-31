import { SearchIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { useController, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  type Client,
  ClientFields,
  ClientMatch,
  useCacheClient,
  useGetClient,
  useListClients,
  useLookupClientByPhone,
} from '@/entities/client'
import { ApiError } from '@/shared/api/api-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'

import {
  newClient,
  newLocation,
  type QuickJobDefinitions,
  type QuickJobFormValues,
  type QuickJobValues,
} from '../model/schema'
import { CustomFieldsBlock } from './form-parts'

const SEARCH_DELAY_MS = 300
const NAME_RESULTS = 5

/** What is already known about the client (a deal's contact): offered as candidates and as the new client's start. */
export interface ClientHints {
  name?: string | null
  contactName?: string | null
  /** E.164 */
  phone?: string | null
  email?: string | null
  type?: 'person' | 'company'
  /** Where the work is, when known: starts the new client's first location. */
  street?: string | null
  city?: string | null
}

/** Find the caller by phone or name, or enter a new client. */
export function ClientPicker({
  definitions,
  hints,
}: {
  definitions: QuickJobDefinitions
  hints?: ClientHints
}) {
  const client = useWatch<QuickJobFormValues, 'client'>({ name: 'client' })
  if (client.kind === 'new') return <NewClient definitions={definitions} />
  if (client.clientId) return <SelectedClient clientId={client.clientId} />
  return <FindClient definitions={definitions} hints={hints} />
}

/** Picking another client starts the location over too. */
function useChooseClient(definitions: QuickJobDefinitions, hints?: ClientHints) {
  const { setValue, clearErrors, formState } = useFormContext<
    QuickJobFormValues,
    unknown,
    QuickJobValues
  >()
  const { locale } = useTenantFormat()
  const options = { shouldValidate: formState.isSubmitted }
  return {
    existing: (clientId: string) => {
      setValue('client', { kind: 'existing', clientId }, options)
      setValue('location', { kind: 'existing', locationId: '' })
      setValue('assetId', '')
      clearErrors('client')
    },
    fresh: (phone = '') => {
      setValue(
        'client',
        newClient(definitions, {
          locale,
          phone,
          ...(hints?.name ? { name: hints.name } : {}),
          ...(hints?.email ? { email: hints.email } : {}),
          ...(hints?.contactName ? { contactName: hints.contactName } : {}),
          ...(hints?.type ? { type: hints.type } : {}),
        }),
      )
      setValue(
        'location',
        newLocation(definitions, {
          locale,
          ...(hints?.street ? { street: hints.street } : {}),
          ...(hints?.city ? { city: hints.city } : {}),
        }),
      )
      setValue('assetId', '')
      clearErrors(['client', 'location'])
    },
    none: () => {
      setValue('client', { kind: 'existing', clientId: '' })
      setValue('location', { kind: 'existing', locationId: '' })
      setValue('assetId', '')
    },
  }
}

function FindClient({
  definitions,
  hints,
}: {
  definitions: QuickJobDefinitions
  hints?: ClientHints
}) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const cacheClient = useCacheClient()
  const choose = useChooseClient(definitions, hints)
  const id = useId()
  // The phone input is where a "choose a client" error takes the focus
  const {
    field: { ref: focusRef },
    fieldState,
  } = useController<QuickJobFormValues, 'client.clientId'>({ name: 'client.clientId' })
  const [phone, setPhone] = useState('')
  const [searched, setSearched] = useState('')
  const [byName, setByName] = useState(false)

  const lookup = useLookupClientByPhone(searched)

  const find = () => {
    const value = phone.trim()
    if (value) setSearched(value)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Enter searches; it must not submit the whole form
    if (event.key === 'Enter') {
      event.preventDefault()
      find()
    }
  }
  const pick = (client: Client) => {
    cacheClient(client)
    choose.existing(client.id)
  }
  const pickCandidate = (id: string, client?: Client) => {
    if (client) cacheClient(client)
    choose.existing(id)
  }

  const lookupError =
    lookup.error instanceof ApiError && lookup.error.fieldErrors.phone
      ? lookup.error.fieldErrors.phone.join(' ')
      : lookup.isError
        ? t('job.create.lookupFailed')
        : null
  const describedBy = [`${id}-hint`, lookupError ? `${id}-error` : null].filter(Boolean).join(' ')

  return (
    <div className="space-y-4">
      {hints && (hints.phone ?? hints.email) && (
        <Candidates phone={hints.phone ?? ''} email={hints.email ?? ''} onPick={pickCandidate} />
      )}
      <Field data-invalid={lookupError ? true : undefined}>
        <FieldLabel htmlFor={id}>{t('job.create.phone')}</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={id}
            ref={focusRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="max-w-xs"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value)
            }}
            onKeyDown={onKeyDown}
            aria-invalid={lookupError ? true : undefined}
            aria-describedby={describedBy}
          />
          <Button type="button" variant="outline" onClick={find} disabled={!phone.trim()}>
            <SearchIcon aria-hidden="true" />
            {lookup.isFetching ? t('job.create.searching') : t('job.create.findByPhone')}
          </Button>
        </div>
        <FieldDescription id={`${id}-hint`}>{t('job.create.phoneHint')}</FieldDescription>
        {lookupError && <FieldError id={`${id}-error`}>{lookupError}</FieldError>}
      </Field>

      {lookup.data && (
        <div className="space-y-2" aria-live="polite">
          {lookup.data.matches.length > 0 ? (
            <>
              <p className="text-sm font-medium">
                {t('job.create.matches', { phone: formatPhone(lookup.data.normalizedPhone) })}
              </p>
              <ul className="space-y-2">
                {lookup.data.matches.map((match) => (
                  <li key={match.id}>
                    <ClientMatch
                      client={match}
                      action={
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            pick(match)
                          }}
                        >
                          {t('job.create.select')}
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm">
                {t('job.create.noMatch', { phone: formatPhone(lookup.data.normalizedPhone) })}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  choose.fresh(formatPhone(lookup.data.normalizedPhone))
                }}
              >
                {t('job.create.newClientWithPhone')}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={byName}
          onClick={() => {
            setByName((open) => !open)
          }}
        >
          {t('job.create.findByName')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            choose.fresh(hints?.phone ? formatPhone(hints.phone) : '')
          }}
        >
          {t('job.create.newClient')}
        </Button>
      </div>

      {byName && <NameSearch onPick={choose.existing} />}

      {fieldState.error?.message && (
        <FieldError role="alert">{fieldState.error.message}</FieldError>
      )}
    </div>
  )
}

/**
 * Existing clients that may be the same person (by the known phone and email). Nothing is
 * chosen for the user: they pick one of them or enter a new client.
 */
function Candidates({
  phone,
  email,
  onPick,
}: {
  phone: string
  email: string
  onPick: (id: string, client?: Client) => void
}) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const byPhone = useLookupClientByPhone(phone)
  const byEmail = useListClients({ q: email, pageSize: NAME_RESULTS }, { enabled: email !== '' })
  const pending = (phone !== '' && byPhone.isPending) || (email !== '' && byEmail.isPending)
  if (pending) return <Skeleton className="h-12" />
  if (byPhone.isError || byEmail.isError) {
    return <FieldError role="alert">{t('sales.convert.candidatesFailed')}</FieldError>
  }
  const seen = new Set<string>()
  const candidates: { id: string; name: string; detail: string; client?: Client }[] = []
  for (const match of byPhone.data?.matches ?? []) {
    seen.add(match.id)
    candidates.push({
      id: match.id,
      name: match.name,
      detail: match.contacts[0]?.phone ? formatPhone(match.contacts[0].phone) : '',
      client: match,
    })
  }
  for (const item of byEmail.data?.items ?? []) {
    if (seen.has(item.id)) continue
    candidates.push({
      id: item.id,
      name: item.name,
      detail: [item.primaryPhone ? formatPhone(item.primaryPhone) : null, item.primaryAddress]
        .filter(Boolean)
        .join(' · '),
    })
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm font-medium">{t('sales.convert.candidates')}</p>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sales.convert.candidatesNone')}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t('sales.convert.candidatesHint')}</p>
          <ul className="space-y-2">
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{candidate.name}</span>
                  <span className="block text-muted-foreground">{candidate.detail}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  aria-label={`${t('job.create.select')}: ${candidate.name}`}
                  onClick={() => {
                    onPick(candidate.id, candidate.client)
                  }}
                >
                  {t('job.create.select')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function NameSearch({ onPick }: { onPick: (clientId: string) => void }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const id = useId()
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearched(query.trim())
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [query])

  const params = { q: searched, pageSize: NAME_RESULTS }
  const results = useListClients(params, { enabled: searched.length >= 2, keepPrevious: true })

  return (
    <div className="space-y-2">
      <Field>
        <FieldLabel htmlFor={id}>{t('job.create.nameQuery')}</FieldLabel>
        <Input
          id={id}
          type="search"
          autoComplete="off"
          className="max-w-md"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
        />
      </Field>
      {results.data && searched.length >= 2 && (
        <ul className="space-y-2" aria-live="polite">
          {results.data.items.length === 0 && (
            <li className="text-sm text-muted-foreground">
              {t('job.create.noResults', { query: searched })}
            </li>
          )}
          {results.data.items.map((client) => (
            <li
              key={client.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium">{client.name}</span>
                <span className="block text-muted-foreground">
                  {[
                    client.primaryPhone ? formatPhone(client.primaryPhone) : null,
                    client.primaryAddress,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onPick(client.id)
                }}
              >
                {t('job.create.select')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SelectedClient({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const client = useGetClient(clientId)
  const { setValue } = useFormContext<QuickJobFormValues, unknown, QuickJobValues>()
  const change = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        setValue('client', { kind: 'existing', clientId: '' })
        setValue('location', { kind: 'existing', locationId: '' })
        setValue('assetId', '')
      }}
    >
      {t('job.create.changeClient')}
    </Button>
  )
  if (client.isPending) return <Skeleton className="h-20" />
  if (client.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <FieldError>{t('job.create.lookupFailed')}</FieldError>
        {change}
      </div>
    )
  }
  return <ClientMatch client={client.data} action={change} />
}

function NewClient({ definitions }: { definitions: QuickJobDefinitions }) {
  const { t } = useTranslation()
  const choose = useChooseClient(definitions)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{t('job.create.newClient')}</p>
        <Button type="button" variant="outline" size="sm" onClick={choose.none}>
          {t('job.create.changeClient')}
        </Button>
      </div>
      <ClientFields name="client" />
      <CustomFieldsBlock definitions={definitions.client} name="client.customFields" />
    </div>
  )
}
