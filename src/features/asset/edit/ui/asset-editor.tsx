import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  type AssetInput,
  type AssetType,
  ASSET_TYPES_STALE_TIME,
  assetTypeKeys,
  buildAssetSchema,
  createAsset,
  deleteAsset,
  listAssetTypes,
  toAssetBody,
  updateAsset,
} from '@/entities/asset'
import { clientKeys } from '@/entities/client'
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
  type CustomFieldFormValues,
  CustomFieldInputs,
  CUSTOM_FIELDS_STALE_TIME,
  customFieldKeys,
  type CustomFieldValues,
  listCustomFieldDefinitions,
} from '@/entities/custom-field'
import { invalidateJobData } from '@/entities/job'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
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

/** Client pages and job pages show equipment: refetch both after a change. */
function useRefreshAfterChange() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: clientKeys.all })
    void invalidateJobData(queryClient)
  }
}

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
  const assetTypes = useQuery({
    queryKey: assetTypeKeys.all,
    queryFn: async ({ signal }) => {
      return listAssetTypes(signal)
    },
    staleTime: ASSET_TYPES_STALE_TIME,
  })
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
  return useQuery({
    queryKey: customFieldKeys.list(scope),
    queryFn: async ({ signal }) => {
      return listCustomFieldDefinitions(scope, signal)
    },
    staleTime: CUSTOM_FIELDS_STALE_TIME,
    enabled: assetTypeId !== '',
  })
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
  const refresh = useRefreshAfterChange()
  const idempotency = useIdempotencyKeys()

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

  const save = useMutation({
    mutationFn: ({ body, key }: { body: AssetInput; key: string }) =>
      asset ? updateAsset(asset.id, body, key) : createAsset(locationId, body, key),
  })
  const submit = form.handleSubmit(async (values) => {
    const body = toAssetBody(values)
    try {
      await save.mutateAsync({ body, key: idempotency.keyFor(body) })
      idempotency.forget(body)
      refresh()
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
  const refresh = useRefreshAfterChange()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = useMutation({ mutationFn: () => deleteAsset(asset.id) })
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
          remove.mutate(undefined, {
            onSuccess: () => {
              setOpen(false)
              refresh()
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
