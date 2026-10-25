import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useListAssetTypes } from '@/entities/asset'
import {
  buildDefinitionSchema,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  definitionFormValues,
  type DefinitionFormValues,
  FIELD_TYPES,
  hasOptions,
  moveOrder,
  nextSortOrder,
  toDefinitionBody,
  useCreateCustomField,
  useDeleteCustomField,
  useListEntityCustomFields,
  useUpdateCustomField,
} from '@/entities/custom-field'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { toKey } from '@/shared/lib/slug'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FieldError } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

const ENTITIES: readonly CustomFieldEntity[] = ['client', 'location', 'asset', 'job']

/** The tenant's custom fields for one kind of record: add, edit, put in order, delete. */
export function CustomFieldsSettings({
  entity,
  onEntityChange,
}: {
  entity: CustomFieldEntity
  onEntityChange: (entity: CustomFieldEntity) => void
}) {
  const { t } = useTranslation()
  const fields = useListEntityCustomFields(entity)
  const assetTypes = useListAssetTypes()
  const update = useUpdateCustomField()
  const [editing, setEditing] = useState<CustomFieldDefinition | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CustomFieldDefinition | null>(null)
  const [moving, setMoving] = useState(false)

  const meta = (definition: CustomFieldDefinition) => {
    const assetType = assetTypes.data?.find((type) => type.id === definition.assetTypeId)
    return [
      t(`settings.customFields.types.${definition.type}`),
      t('settings.customFields.meta.key', { key: definition.key }),
      definition.required ? t('settings.customFields.meta.required') : null,
      definition.isSensitive ? t('settings.customFields.meta.sensitive') : null,
      entity === 'asset'
        ? definition.assetTypeId
          ? t('settings.customFields.meta.scope', { name: assetType?.name ?? '…' })
          : t('settings.customFields.meta.allTypes')
        : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  /** What the row's buttons are called: equipment fields of different types may share a label. */
  const nameOf = (definition: CustomFieldDefinition) => {
    const assetType = assetTypes.data?.find((type) => type.id === definition.assetTypeId)
    return assetType ? `${definition.label} (${assetType.name})` : definition.label
  }

  const move = async (index: number, direction: -1 | 1) => {
    const definitions = fields.data ?? []
    const changes = moveOrder(definitions, index, direction)
    setMoving(true)
    try {
      for (const change of changes) {
        const definition = definitions.find((d) => d.id === change.id)
        if (!definition) continue
        await update.mutateAsync({
          id: definition.id,
          body: toDefinitionBody(definitionFormValues(definition), {
            entity,
            sortOrder: change.sortOrder,
          }),
        })
      }
    } catch {
      toast.error(t('settings.customFields.moveFailed'))
    } finally {
      setMoving(false)
    }
  }

  return (
    <section aria-label={t('settings.customFields.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.customFields.title')}
        description={t('settings.customFields.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.customFields.add')}
          </Button>
        }
      />
      <div
        role="group"
        aria-label={t('settings.customFields.entities')}
        className="flex flex-wrap gap-2"
      >
        {ENTITIES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={value === entity ? 'default' : 'outline'}
            aria-pressed={value === entity}
            onClick={() => {
              onEntityChange(value)
            }}
          >
            {t(`customField.entity.${value}`)}
          </Button>
        ))}
      </div>
      {fields.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.customFields.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void fields.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !fields.data ? (
        <Skeleton className="h-40" />
      ) : fields.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.customFields.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.customFields.list')}>
          {fields.data.map((definition, index) => (
            <ConfigListItem
              key={definition.id}
              title={
                <>
                  {definition.label}
                  {definition.isSensitive && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      {t('settings.customFields.meta.sensitive')}
                    </Badge>
                  )}
                </>
              }
              meta={meta(definition)}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={moving || index === 0}
                    aria-label={t('settings.customFields.moveUp', { name: nameOf(definition) })}
                    onClick={() => void move(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={moving || index === fields.data.length - 1}
                    aria-label={t('settings.customFields.moveDown', { name: nameOf(definition) })}
                    onClick={() => void move(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${nameOf(definition)}`}
                    onClick={() => {
                      setEditing(definition)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${nameOf(definition)}`}
                    onClick={() => {
                      setDeleting(definition)
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
        <DefinitionSheet
          entity={entity}
          definition={editing === 'new' ? undefined : editing}
          sortOrder={editing === 'new' ? nextSortOrder(fields.data ?? []) : editing.sortOrder}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteDefinitionDialog
        definition={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function DefinitionSheet({
  entity,
  definition,
  sortOrder,
  onClose,
}: {
  entity: CustomFieldEntity
  definition?: CustomFieldDefinition
  sortOrder: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const assetTypes = useListAssetTypes()
  const schema = useMemo(() => buildDefinitionSchema(), [])
  const form = useForm<DefinitionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: definitionFormValues(definition),
  })
  const create = useCreateCustomField()
  const update = useUpdateCustomField()
  const type = useWatch({ control: form.control, name: 'type' })
  const label = useWatch({ control: form.control, name: 'label' })
  const { dirtyFields } = form.formState

  // A new field's key follows its label until the key is typed by hand
  useEffect(() => {
    if (!definition && !dirtyFields.key) form.setValue('key', toKey(label))
  }, [definition, dirtyFields.key, form, label])

  const submit = form.handleSubmit(async (values) => {
    const body = toDefinitionBody(values, { entity, sortOrder })
    try {
      if (definition) await update.mutateAsync({ id: definition.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.customFields.saved'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        form.setError('key', { message: t('settings.customFields.duplicateKey') })
        return
      }
      reportSaveError(error, form, t('settings.customFields.failed'))
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
          definition ? t('settings.customFields.editTitle') : t('settings.customFields.newTitle')
        }
        description={t(`customField.entity.${entity}`)}
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
        <TextField name="label" label={t('settings.customFields.label')} required autoFocus />
        <TextField
          name="key"
          label={t('settings.customFields.key')}
          hint={
            definition ? t('settings.customFields.keyLocked') : t('settings.customFields.keyHint')
          }
          disabled={definition !== undefined}
          required
        />
        <SelectField
          name="type"
          label={t('settings.customFields.type')}
          emptyLabel={t('customField.choose')}
          options={FIELD_TYPES.map((value) => ({
            value,
            label: t(`settings.customFields.types.${value}`),
          }))}
          disabled={definition !== undefined}
          required
        />
        {entity === 'asset' && (
          <SelectField
            name="assetTypeId"
            label={t('settings.customFields.assetType')}
            emptyLabel={t('settings.customFields.allAssetTypes')}
            options={(assetTypes.data ?? []).map((assetType) => ({
              value: assetType.id,
              label: assetType.name,
            }))}
          />
        )}
        {hasOptions(type) && <OptionRows />}
        <CheckboxField name="required" label={t('settings.customFields.required')} />
        <CheckboxField name="isSensitive" label={t('settings.customFields.isSensitive')} />
      </FormSheet>
    </FormProvider>
  )
}

/** The choices of a select field, in order; a renamed one keeps its stored value. */
function OptionRows() {
  const { t } = useTranslation()
  const {
    control,
    formState: { errors },
  } = useFormContext<DefinitionFormValues>()
  const { fields, append, remove, move } = useFieldArray({ control, name: 'options' })
  const listError = errors.options?.root?.message ?? errors.options?.message

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t('settings.customFields.options')}</legend>
      <p className="text-sm text-muted-foreground">{t('settings.customFields.optionsHint')}</p>
      <ol className="space-y-2">
        {fields.map((field, index) => {
          const number = index + 1
          return (
            <li key={field.id} className="flex items-start gap-2">
              <TextField
                name={`options.${String(index)}.label`}
                label={t('settings.customFields.option', { number })}
                className="flex-1"
              />
              <div className="mt-6 flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === 0}
                  aria-label={t('settings.customFields.moveOptionUp', { number })}
                  onClick={() => {
                    move(index, index - 1)
                  }}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={index === fields.length - 1}
                  aria-label={t('settings.customFields.moveOptionDown', { number })}
                  onClick={() => {
                    move(index, index + 1)
                  }}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('settings.customFields.removeOption', { number })}
                  onClick={() => {
                    remove(index)
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      {listError && <FieldError>{listError}</FieldError>}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          append({ value: '', label: '' })
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('settings.customFields.addOption')}
      </Button>
    </fieldset>
  )
}

function DeleteDefinitionDialog({
  definition,
  onClose,
}: {
  definition: CustomFieldDefinition | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteCustomField()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<CustomFieldDefinition | null>(null)
  if (definition && definition !== last) {
    setLast(definition)
    setError(null)
  }
  const name = (definition ?? last)?.label ?? ''
  return (
    <ConfirmDialog
      open={definition !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.customFields.delete.title')}
      description={t('settings.customFields.delete.description', { name })}
      confirmLabel={t('settings.customFields.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!definition) return
        remove.mutate(definition.id, {
          onSuccess: () => {
            toast.success(t('settings.customFields.delete.done', { name }))
            onClose()
          },
          onError: () => {
            setError(t('settings.customFields.delete.failed'))
          },
        })
      }}
    />
  )
}
