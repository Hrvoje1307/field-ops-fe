import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useMemo } from 'react'
import { FormProvider, useController, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  buildClientSchema,
  type ClientCreate,
  clientFormValues,
  clientKeys,
  ClientProfileFields,
  ContactsFields,
  createClient,
  toClientBody,
} from '@/entities/client'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  CustomFieldInputs,
  type CustomFieldScope,
  CUSTOM_FIELDS_STALE_TIME,
  customFieldKeys,
  listCustomFieldDefinitions,
} from '@/entities/custom-field'
import {
  buildLocationSchema,
  LocationFields,
  locationFormValues,
  toLocationBody,
} from '@/entities/location'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const SCOPES = {
  client: { entity: 'client' },
  location: { entity: 'location' },
} as const satisfies Record<string, CustomFieldScope>

function useDefinitions(scope: CustomFieldScope) {
  return useQuery({
    queryKey: customFieldKeys.list(scope),
    queryFn: async ({ signal }) => {
      return listCustomFieldDefinitions(scope, signal)
    },
    staleTime: CUSTOM_FIELDS_STALE_TIME,
  })
}

/** A new client without a job: their fields, contacts, and (by default) a first location. */
export function CreateClientForm() {
  const { t } = useTranslation()
  const client = useDefinitions(SCOPES.client)
  const location = useDefinitions(SCOPES.location)
  if (client.isError || location.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('client.form.failed')}</AlertDescription>
      </Alert>
    )
  }
  if (!client.data || !location.data) return <Skeleton className="h-96" />
  return <Form clientFields={client.data} locationFields={location.data} />
}

function buildSchema(
  clientFields: CustomFieldDefinition[],
  locationFields: CustomFieldDefinition[],
) {
  const client = buildClientSchema(buildCustomFieldsSchema(clientFields))
  return z.discriminatedUnion('withLocation', [
    client.extend({
      withLocation: z.literal(true),
      firstLocation: buildLocationSchema(buildCustomFieldsSchema(locationFields)),
    }),
    client.extend({ withLocation: z.literal(false) }),
  ])
}

function Form({
  clientFields,
  locationFields,
}: {
  clientFields: CustomFieldDefinition[]
  locationFields: CustomFieldDefinition[]
}) {
  const { t } = useTranslation()
  const { locale, country } = useTenantFormat()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const idempotency = useIdempotencyKeys()
  const schema = useMemo(
    () => buildSchema(clientFields, locationFields),
    [clientFields, locationFields],
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      ...clientFormValues(undefined, customFieldFormValues(clientFields, {}, { locale })),
      withLocation: true as const,
      firstLocation: locationFormValues(
        undefined,
        customFieldFormValues(locationFields, {}, { locale }),
      ),
    },
  })
  const save = useMutation({
    mutationFn: ({ body, key }: { body: ClientCreate; key: string }) => createClient(body, key),
  })

  const submit = form.handleSubmit(async (values) => {
    const body: ClientCreate = {
      ...toClientBody(values),
      ...(values.withLocation
        ? { firstLocation: toLocationBody(values.firstLocation, country) }
        : {}),
    }
    try {
      const client = await save.mutateAsync({ body, key: idempotency.keyFor(body) })
      idempotency.forget(body)
      queryClient.setQueryData(clientKeys.detail(client.id), client)
      void queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success(t('client.form.created', { name: client.name }))
      void navigate({ to: '/clients/$clientId', params: { clientId: client.id } })
    } catch (error) {
      reportSaveError(error, form, t('client.form.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <form noValidate className="space-y-6" onSubmit={(event) => void submit(event)}>
        <Section>
          <ClientProfileFields />
          {clientFields.length > 0 && <CustomFieldInputs definitions={clientFields} />}
        </Section>
        <Section>
          <ContactsFields />
        </Section>
        <Section>
          <FirstLocation locationFields={locationFields} />
        </Section>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('client.form.saving') : t('client.form.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}

function FirstLocation({ locationFields }: { locationFields: CustomFieldDefinition[] }) {
  const { t } = useTranslation()
  const id = useId()
  const {
    field: { value, onChange },
  } = useController<{ withLocation: boolean }, 'withLocation'>({ name: 'withLocation' })
  return (
    <div className="space-y-4">
      <label htmlFor={id} className="flex items-center gap-2 font-medium">
        <input
          id={id}
          type="checkbox"
          className="accent-primary"
          checked={value}
          onChange={(event) => {
            onChange(event.target.checked)
          }}
        />
        {t('client.form.addFirstLocation')}
      </label>
      {value && (
        <>
          <LocationFields name="firstLocation" codes="masked" />
          {locationFields.length > 0 && (
            <CustomFieldInputs definitions={locationFields} name="firstLocation.customFields" />
          )}
        </>
      )}
    </div>
  )
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 rounded-xl border p-4 md:p-6">{children}</div>
}
