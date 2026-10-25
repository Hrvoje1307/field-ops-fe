import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildDepotSchema,
  type Depot,
  depotFormValues,
  type DepotFormValues,
  toDepotBody,
  useCreateDepot,
  useDeleteDepot,
  useListDepots,
  useUpdateDepot,
} from '@/entities/depot'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/** The tenant's depots and workshops: where technicians start and when they work. */
export function DepotsSettings() {
  const { t } = useTranslation()
  const depots = useListDepots()
  const [editing, setEditing] = useState<Depot | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Depot | null>(null)

  return (
    <section aria-label={t('settings.depots.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.depots.title')}
        description={t('settings.depots.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.depots.add')}
          </Button>
        }
      />
      {depots.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.depots.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void depots.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !depots.data ? (
        <Skeleton className="h-40" />
      ) : depots.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.depots.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.depots.list')}>
          {depots.data.map((depot) => (
            <ConfigListItem
              key={depot.id}
              title={depot.name}
              meta={`${depot.address} · ${t('settings.depots.hours', { from: depot.opensAt, to: depot.closesAt })}`}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${depot.name}`}
                    onClick={() => {
                      setEditing(depot)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${depot.name}`}
                    onClick={() => {
                      setDeleting(depot)
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </>
              }
            />
          ))}
        </ConfigList>
      )}
      {editing && (
        <DepotSheet
          depot={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteDepotDialog
        depot={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function DepotSheet({ depot, onClose }: { depot?: Depot; onClose: () => void }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildDepotSchema(), [])
  const form = useForm<DepotFormValues>({
    resolver: zodResolver(schema),
    defaultValues: depotFormValues(depot),
  })
  const create = useCreateDepot()
  const update = useUpdateDepot()

  const submit = form.handleSubmit(async (values) => {
    const body = toDepotBody(values)
    try {
      if (depot) await update.mutateAsync({ id: depot.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.depots.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('settings.depots.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={depot ? t('settings.depots.editTitle') : t('settings.depots.newTitle')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <TextField name="name" label={t('settings.depots.name')} required autoFocus />
        <TextField name="address" label={t('settings.depots.address')} required />
        <FieldRow>
          <TextField name="opensAt" type="time" label={t('settings.depots.opensAt')} required />
          <TextField name="closesAt" type="time" label={t('settings.depots.closesAt')} required />
        </FieldRow>
        <FieldRow>
          <TextField
            name="lat"
            inputMode="decimal"
            label={t('settings.depots.lat')}
            hint={t('settings.depots.coordinatesHint')}
          />
          <TextField name="lng" inputMode="decimal" label={t('settings.depots.lng')} />
        </FieldRow>
      </FormSheet>
    </FormProvider>
  )
}

function DeleteDepotDialog({ depot, onClose }: { depot: Depot | null; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useDeleteDepot()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<Depot | null>(null)
  if (depot && depot !== last) {
    setLast(depot)
    setError(null)
  }
  const name = (depot ?? last)?.name ?? ''
  return (
    <ConfirmDialog
      open={depot !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.depots.delete.title')}
      description={t('settings.depots.delete.description', { name })}
      confirmLabel={t('settings.depots.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!depot) return
        remove.mutate(depot.id, {
          onSuccess: () => {
            toast.success(t('settings.depots.delete.done', { name }))
            onClose()
          },
          onError: (failure) => {
            setError(
              isConflict(failure)
                ? t('settings.depots.delete.inUse')
                : t('settings.depots.delete.failed'),
            )
          },
        })
      }}
    />
  )
}
