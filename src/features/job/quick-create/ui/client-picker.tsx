import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { useController, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  type Client,
  CLIENT_STALE_TIME,
  ClientFields,
  clientKeys,
  ClientMatch,
  getClient,
  listClients,
  lookupClientByPhone,
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

/** Find the caller by phone or name, or enter a new client. */
export function ClientPicker({ definitions }: { definitions: QuickJobDefinitions }) {
  const client = useWatch<QuickJobFormValues, 'client'>({ name: 'client' })
  if (client.kind === 'new') return <NewClient definitions={definitions} />
  if (client.clientId) return <SelectedClient clientId={client.clientId} />
  return <FindClient definitions={definitions} />
}

/** Picking another client starts the location over too. */
function useChooseClient(definitions: QuickJobDefinitions) {
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
      setValue('client', newClient(definitions, { locale, phone }))
      setValue('location', newLocation(definitions, { locale }))
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

function FindClient({ definitions }: { definitions: QuickJobDefinitions }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const queryClient = useQueryClient()
  const choose = useChooseClient(definitions)
  const id = useId()
  // The phone input is where a "choose a client" error takes the focus
  const {
    field: { ref: focusRef },
    fieldState,
  } = useController<QuickJobFormValues, 'client.clientId'>({ name: 'client.clientId' })
  const [phone, setPhone] = useState('')
  const [searched, setSearched] = useState('')
  const [byName, setByName] = useState(false)

  const lookup = useQuery({
    queryKey: clientKeys.lookup({ phone: searched }),
    queryFn: async ({ signal }) => {
      return lookupClientByPhone({ phone: searched }, signal)
    },
    staleTime: CLIENT_STALE_TIME,
    enabled: searched !== '',
  })

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
    queryClient.setQueryData(clientKeys.detail(client.id), client)
    choose.existing(client.id)
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
            choose.fresh()
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
  const results = useQuery({
    queryKey: clientKeys.list(params),
    queryFn: async ({ signal }) => {
      return listClients(params, signal)
    },
    staleTime: CLIENT_STALE_TIME,
    enabled: searched.length >= 2,
    placeholderData: keepPreviousData,
  })

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
  const client = useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async ({ signal }) => {
      return getClient(clientId, signal)
    },
    staleTime: CLIENT_STALE_TIME,
  })
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
