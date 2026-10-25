import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildClientSchema,
  type Client,
  clientFormValues,
  ClientProfileFields,
  ContactsFields,
  toClientBody,
  useDeleteClient,
  useGetClient,
  useUpdateClient,
} from '@/entities/client'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  CustomFieldInputs,
  useListCustomFieldDefinitions,
} from '@/entities/custom-field'

import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'

const CLIENT_SCOPE = { entity: 'client' } as const

/** "Uredi": the client's own fields, contacts and custom fields in a side panel. */
export function EditClientButton({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        <PencilIcon aria-hidden="true" />
        {t('client.detail.edit')}
      </Button>
      {open && (
        <EditClientSheet
          clientId={clientId}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function EditClientSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useGetClient(clientId)
  const definitionsQuery = useListCustomFieldDefinitions(CLIENT_SCOPE)

  if (!client.data || !definitionsQuery.data) {
    return (
      <FormSheet
        open
        onOpenChange={onClose}
        title={t('client.form.editTitle')}
        onSubmit={(event) => {
          event.preventDefault()
        }}
        footer={null}
      >
        {client.isError || definitionsQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('client.detail.loadFailed')}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64" />
        )}
      </FormSheet>
    )
  }
  return (
    <EditClientForm client={client.data} definitions={definitionsQuery.data} onClose={onClose} />
  )
}

function EditClientForm({
  client,
  definitions,
  onClose,
}: {
  client: Client
  definitions: CustomFieldDefinition[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { locale, formatPhone } = useTenantFormat()
  const [conflicted, setConflicted] = useState(false)
  const schema = useMemo(
    () => buildClientSchema(buildCustomFieldsSchema(definitions)),
    [definitions],
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: clientFormValues(
      client,
      customFieldFormValues(definitions, client.customFields, { locale }),
      formatPhone,
    ),
  })
  const save = useUpdateClient()

  const submit = form.handleSubmit(async (values) => {
    // `client` is the live query data: after a 409 it is the refetched client
    const body = toClientBody(values, client.version)
    try {
      await save.mutateAsync({ id: client.id, body })
      toast.success(t('client.form.saved'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        // The hook has refetched the client and told the user
        setConflicted(true)
        return
      }
      reportSaveError(error, form, t('client.form.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('client.form.editTitle')}
        description={client.name}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('client.form.saving') : t('client.form.save')}
            </Button>
          </>
        }
      >
        {conflicted && (
          <Alert role="alert">
            <AlertDescription>{t('client.form.changed')}</AlertDescription>
          </Alert>
        )}
        <ClientProfileFields />
        <ContactsFields />
        {definitions.length > 0 && <CustomFieldInputs definitions={definitions} />}
      </FormSheet>
    </FormProvider>
  )
}

/** "Obriši": asks first; the API refuses while the client has open jobs. */
export function DeleteClientButton({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const client = useGetClient(clientId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteClient()
  const name = client.data?.name ?? ''

  return (
    <>
      <Button
        variant="outline"
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
        title={t('client.delete.title')}
        description={t('client.delete.description', { name })}
        confirmLabel={t('client.delete.confirm')}
        pending={remove.isPending}
        error={error}
        onConfirm={() => {
          remove.mutate(clientId, {
            onSuccess: () => {
              setOpen(false)
              toast.success(t('client.delete.done', { name }))
              void navigate({ to: '/clients' })
            },
            onError: (failure) => {
              setError(
                isConflict(failure) ? t('client.delete.openJobs') : t('client.delete.failed'),
              )
            },
          })
        }}
      />
    </>
  )
}
