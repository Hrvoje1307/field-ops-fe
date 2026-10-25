import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildAssetTypeSchema,
  type AssetType,
  assetTypeFormValues,
  type AssetTypeFormValues,
  toAssetTypeBody,
  useCreateAssetType,
  useDeleteAssetType,
  useListAssetTypes,
  useUpdateAssetType,
} from '@/entities/asset'
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
import { TextField } from '@/shared/ui/text-field'

/** The tenant's equipment types: add, rename, delete. */
export function EquipmentTypesSettings() {
  const { t } = useTranslation()
  const types = useListAssetTypes()
  const [editing, setEditing] = useState<AssetType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<AssetType | null>(null)

  return (
    <section aria-label={t('settings.equipmentTypes.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.equipmentTypes.title')}
        description={t('settings.equipmentTypes.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.equipmentTypes.add')}
          </Button>
        }
      />
      {types.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.equipmentTypes.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void types.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !types.data ? (
        <Skeleton className="h-40" />
      ) : types.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.equipmentTypes.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.equipmentTypes.list')}>
          {types.data.map((assetType) => (
            <ConfigListItem
              key={assetType.id}
              title={assetType.name}
              meta={assetType.icon}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${assetType.name}`}
                    onClick={() => {
                      setEditing(assetType)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${assetType.name}`}
                    onClick={() => {
                      setDeleting(assetType)
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
        <AssetTypeSheet
          assetType={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteAssetTypeDialog
        assetType={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function AssetTypeSheet({ assetType, onClose }: { assetType?: AssetType; onClose: () => void }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildAssetTypeSchema(), [])
  const form = useForm<AssetTypeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: assetTypeFormValues(assetType),
  })
  const create = useCreateAssetType()
  const update = useUpdateAssetType()

  const submit = form.handleSubmit(async (values) => {
    const body = toAssetTypeBody(values)
    try {
      if (assetType) await update.mutateAsync({ id: assetType.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.equipmentTypes.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('settings.equipmentTypes.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={
          assetType ? t('settings.equipmentTypes.editTitle') : t('settings.equipmentTypes.newTitle')
        }
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
        <TextField name="name" label={t('settings.equipmentTypes.name')} required autoFocus />
        <TextField
          name="icon"
          label={t('settings.equipmentTypes.icon')}
          hint={t('settings.equipmentTypes.iconHint')}
        />
      </FormSheet>
    </FormProvider>
  )
}

function DeleteAssetTypeDialog({
  assetType,
  onClose,
}: {
  assetType: AssetType | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteAssetType()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<AssetType | null>(null)
  if (assetType && assetType !== last) {
    setLast(assetType)
    setError(null)
  }
  const name = (assetType ?? last)?.name ?? ''
  return (
    <ConfirmDialog
      open={assetType !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.equipmentTypes.delete.title')}
      description={t('settings.equipmentTypes.delete.description', { name })}
      confirmLabel={t('settings.equipmentTypes.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!assetType) return
        remove.mutate(assetType.id, {
          onSuccess: () => {
            toast.success(t('settings.equipmentTypes.delete.done', { name }))
            onClose()
          },
          onError: (failure) => {
            setError(
              isConflict(failure)
                ? t('settings.equipmentTypes.delete.inUse')
                : t('settings.equipmentTypes.delete.failed'),
            )
          },
        })
      }}
    />
  )
}
