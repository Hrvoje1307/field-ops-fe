import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { clientKeys } from '@/entities/client'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  CustomFieldInputs,
  CUSTOM_FIELDS_STALE_TIME,
  customFieldKeys,
  listCustomFieldDefinitions,
} from '@/entities/custom-field'
import { invalidateJobData } from '@/entities/job'
import {
  buildLocationSchema,
  createLocation,
  deleteLocation,
  type Location,
  LocationFields,
  locationFormValues,
  type LocationInput,
  toLocationBody,
  updateLocation,
} from '@/entities/location'
import { isConflict } from '@/shared/api/api-error'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'

const LOCATION_SCOPE = { entity: 'location' } as const

/** Client pages and job pages show locations: refetch both after a change. */
function useRefreshAfterChange() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: clientKeys.all })
    void invalidateJobData(queryClient)
  }
}

/**
 * "Dodaj lokaciju" (no `location`) or "Uredi" for one location, in a side panel.
 * Access codes stay masked unless revealed; untouched, they are kept as stored.
 */
export function LocationEditorButton({
  clientId,
  location,
}: {
  clientId: string
  location?: Location
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const name = location?.label ?? location?.address ?? ''
  return (
    <>
      {location ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('client.detail.editLocation', { name })}
          onClick={() => {
            setOpen(true)
          }}
        >
          <PencilIcon aria-hidden="true" />
          {t('client.detail.edit')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true)
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t('client.detail.addLocation')}
        </Button>
      )}
      {open && (
        <LocationSheet
          clientId={clientId}
          location={location}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function LocationSheet({
  clientId,
  location,
  onClose,
}: {
  clientId: string
  location: Location | undefined
  onClose: () => void
}) {
  const { t } = useTranslation()
  const definitionsQuery = useQuery({
    queryKey: customFieldKeys.list(LOCATION_SCOPE),
    queryFn: async ({ signal }) => {
      return listCustomFieldDefinitions(LOCATION_SCOPE, signal)
    },
    staleTime: CUSTOM_FIELDS_STALE_TIME,
  })
  const title = location ? t('location.form.editTitle') : t('location.form.addTitle')
  if (!definitionsQuery.data) {
    return (
      <FormSheet
        open
        onOpenChange={onClose}
        title={title}
        onSubmit={(event) => {
          event.preventDefault()
        }}
        footer={null}
      >
        {definitionsQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('location.form.failed')}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64" />
        )}
      </FormSheet>
    )
  }
  return (
    <LocationForm
      clientId={clientId}
      location={location}
      definitions={definitionsQuery.data}
      title={title}
      onClose={onClose}
    />
  )
}

function LocationForm({
  clientId,
  location,
  definitions,
  title,
  onClose,
}: {
  clientId: string
  location: Location | undefined
  definitions: CustomFieldDefinition[]
  title: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { locale, country } = useTenantFormat()
  const refresh = useRefreshAfterChange()
  const idempotency = useIdempotencyKeys()
  const schema = useMemo(
    () => buildLocationSchema(buildCustomFieldsSchema(definitions)),
    [definitions],
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: locationFormValues(
      location,
      customFieldFormValues(definitions, location?.customFields, { locale }),
    ),
  })
  const save = useMutation({
    mutationFn: ({ body, key }: { body: LocationInput; key: string }) =>
      location ? updateLocation(location.id, body, key) : createLocation(clientId, body, key),
  })

  const submit = form.handleSubmit(async (values) => {
    // A stored location keeps its own country; a new one gets the tenant's
    const body = toLocationBody(values, location ? location.country : country)
    try {
      await save.mutateAsync({ body, key: idempotency.keyFor(body) })
      idempotency.forget(body)
      refresh()
      toast.success(t('location.form.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('location.form.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={title}
        description={location?.address}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('location.form.saving') : t('location.form.save')}
            </Button>
          </>
        }
      >
        <LocationFields name="" codes="masked" />
        {definitions.length > 0 && <CustomFieldInputs definitions={definitions} />}
      </FormSheet>
    </FormProvider>
  )
}

/** "Obriši" for a location: asks first; the API refuses while it has open jobs. */
export function DeleteLocationButton({ location }: { location: Location }) {
  const { t } = useTranslation()
  const refresh = useRefreshAfterChange()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({ mutationFn: () => deleteLocation(location.id) })
  const name = location.label ?? location.address ?? ''

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('client.detail.deleteLocation', { name })}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        <Trash2Icon aria-hidden="true" />
        {t('client.detail.delete')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('location.delete.title')}
        description={t('location.delete.description', { name: location.address ?? name })}
        confirmLabel={t('location.delete.confirm')}
        pending={remove.isPending}
        error={error}
        onConfirm={() => {
          remove.mutate(undefined, {
            onSuccess: () => {
              setOpen(false)
              refresh()
              toast.success(t('location.delete.done'))
            },
            onError: (failure) => {
              setError(
                isConflict(failure) ? t('location.delete.openJobs') : t('location.delete.failed'),
              )
            },
          })
        }}
      />
    </>
  )
}
