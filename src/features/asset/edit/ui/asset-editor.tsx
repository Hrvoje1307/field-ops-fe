import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FormProvider, type Resolver, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type Asset,
  AssetFields,
  assetFormValues,
  type AssetFormValues,
  type AssetType,
  buildAssetSchema,
  toAssetBody,
  useCreateAsset,
  useDeleteAsset,
  useListAssetTypes,
  useUpdateAsset,
} from '@/entities/asset'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  type CustomFieldFormValues,
  CustomFieldInputs,
  type CustomFieldValues,
  useListCustomFieldDefinitions,
} from '@/entities/custom-field'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'

/** No type chosen yet: no fields. */
const NO_FIELDS: CustomFieldDefinition[] = []

type FormInput = AssetFormValues<CustomFieldFormValues>
type FormOutput = AssetFormValues<CustomFieldValues>

const assetName = (asset: Asset) =>
  [asset.assetType.name, asset.manufacturer, asset.model].filter(Boolean).join(' ')

/** "Dodaj opremu" on a location (no `asset`) or "Uredi" for one piece of equipment. */
export function AssetEditorButton({
  locationId,
  locationName,
  asset,
}: {
  locationId: string
  /** For the add button's accessible name. */
  locationName?: string
  asset?: Asset
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      {asset ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('client.detail.editAsset', { name: assetName(asset) })}
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
          aria-label={t('client.detail.addAssetTo', { name: locationName ?? '' })}
          onClick={() => {
            setOpen(true)
          }}
        >
          <PlusIcon aria-hidden="true" />
          {t('client.detail.addAsset')}
        </Button>
      )}
      {open && (
        <AssetSheet
          locationId={locationId}
          asset={asset}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function AssetSheet({
  locationId,
  asset,
  onClose,
}: {
  locationId: string
  asset: Asset | undefined
  onClose: () => void
}) {
  const { t } = useTranslation()
  const assetTypes = useListAssetTypes()
  const title = asset ? t('asset.form.editTitle') : t('asset.form.addTitle')
  if (!assetTypes.data) {
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
        {assetTypes.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('asset.form.failed')}</AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64" />
        )}
      </FormSheet>
    )
  }
  return (
    <AssetForm
      locationId={locationId}
      asset={asset}
      assetTypes={assetTypes.data}
      title={title}
      onClose={onClose}
    />
  )
}

/** The chosen type's field definitions (none until a type is chosen). */
function useTypeFields(assetTypeId: string) {
  const scope = { entity: 'asset', assetTypeId } as const
  return useListCustomFieldDefinitions(scope, { enabled: assetTypeId !== '' })
}

function AssetForm({
  locationId,
  asset,
  assetTypes,
  title,
  onClose,
}: {
  locationId: string
  asset: Asset | undefined
  assetTypes: AssetType[]
  title: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { locale } = useTenantFormat()

  // The fields depend on the chosen type, so the schema is read at validation time
  const definitionsRef = useRef<CustomFieldDefinition[]>([])
  const resolver: Resolver<FormInput, unknown, FormOutput> = (values, context, options) =>
    zodResolver(buildAssetSchema(buildCustomFieldsSchema(definitionsRef.current)))(
      values,
      context,
      options,
    )
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver,
    defaultValues: assetFormValues<CustomFieldFormValues>(asset, {}),
  })
  const assetTypeId = useWatch({ control: form.control, name: 'assetTypeId' })
  const typeFields = useTypeFields(assetTypeId)
  const definitions = assetTypeId ? typeFields.data : NO_FIELDS
  useEffect(() => {
    definitionsRef.current = definitions ?? []
  }, [definitions])

  // A (new) type's fields start from the stored values when the type is the asset's own
  const appliedType = useRef<string | null>(null)
  useEffect(() => {
    if (definitions === undefined || appliedType.current === assetTypeId) return
    appliedType.current = assetTypeId
    const stored = asset?.assetTypeId === assetTypeId ? asset.customFields : {}
    form.setValue('customFields', customFieldFormValues(definitions, stored, { locale }))
  }, [definitions, assetTypeId, asset, form, locale])

  const create = useCreateAsset()
  const update = useUpdateAsset()
  const submit = form.handleSubmit(async (values) => {
    const body = toAssetBody(values)
    try {
      if (asset) await update.mutateAsync({ id: asset.id, body })
      else await create.mutateAsync({ locationId, body })
      toast.success(t('asset.form.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('asset.form.failed'))
    }
  })
  const fieldsReady = assetTypeId !== '' && definitions !== undefined

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={title}
        description={asset ? assetName(asset) : undefined}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || (assetTypeId !== '' && !fieldsReady)}
            >
              {form.formState.isSubmitting ? t('asset.form.saving') : t('asset.form.save')}
            </Button>
          </>
        }
      >
        <AssetFields assetTypes={assetTypes} />
        {assetTypeId !== '' &&
          (fieldsReady ? (
            definitions.length > 0 && <CustomFieldInputs definitions={definitions} />
          ) : typeFields.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{t('asset.form.failed')}</AlertDescription>
            </Alert>
          ) : (
            <Skeleton className="h-24" />
          ))}
      </FormSheet>
    </FormProvider>
  )
}

/** "Obriši" for a piece of equipment, after a confirmation. */
export function DeleteAssetButton({ asset }: { asset: Asset }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteAsset()
  const name = assetName(asset)

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('client.detail.deleteAsset', { name })}
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
        title={t('asset.delete.title')}
        description={t('asset.delete.description', { name })}
        confirmLabel={t('asset.delete.confirm')}
        pending={remove.isPending}
        error={error}
        onConfirm={() => {
          remove.mutate(asset.id, {
            onSuccess: () => {
              setOpen(false)
              toast.success(t('asset.delete.done'))
            },
            onError: () => {
              setError(t('asset.delete.failed'))
            },
          })
        }}
      />
    </>
  )
}
