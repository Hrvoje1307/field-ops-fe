import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildChecklistTemplateSchema,
  type ChecklistTemplate,
  checklistTemplateFormValues,
  type ChecklistTemplateFormValues,
  emptyChecklistItem,
  toChecklistTemplateBody,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useListChecklistTemplates,
  useUpdateChecklistTemplate,
} from '@/entities/checklist-template'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
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
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

/** The tenant's checklist templates: a name and the items a technician goes through. */
export function ChecklistsSettings() {
  const { t } = useTranslation()
  const templates = useListChecklistTemplates()
  const [editing, setEditing] = useState<ChecklistTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ChecklistTemplate | null>(null)

  return (
    <section aria-label={t('settings.checklists.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.checklists.title')}
        description={t('settings.checklists.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.checklists.add')}
          </Button>
        }
      />
      {templates.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.checklists.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void templates.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !templates.data ? (
        <Skeleton className="h-40" />
      ) : templates.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.checklists.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.checklists.list')}>
          {templates.data.map((template) => {
            const required = template.items.filter((item) => item.required).length
            return (
              <ConfigListItem
                key={template.id}
                title={template.name}
                meta={[
                  t('settings.checklists.count', { count: template.items.length }),
                  required > 0 ? t('settings.checklists.required', { count: required }) : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                actions={
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t('common.edit')}: ${template.name}`}
                      onClick={() => {
                        setEditing(template)
                      }}
                    >
                      <PencilIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${t('common.delete')}: ${template.name}`}
                      onClick={() => {
                        setDeleting(template)
                      }}
                    >
                      <Trash2Icon aria-hidden="true" />
                    </Button>
                  </>
                }
              />
            )
          })}
        </ConfigList>
      )}
      {editing && (
        <TemplateSheet
          template={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteTemplateDialog
        template={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function TemplateSheet({
  template,
  onClose,
}: {
  template?: ChecklistTemplate
  onClose: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildChecklistTemplateSchema(), [])
  const form = useForm<ChecklistTemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: checklistTemplateFormValues(template),
  })
  const create = useCreateChecklistTemplate()
  const update = useUpdateChecklistTemplate()

  const submit = form.handleSubmit(async (values) => {
    const body = toChecklistTemplateBody(values)
    try {
      if (template) await update.mutateAsync({ id: template.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.checklists.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('settings.checklists.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={template ? t('settings.checklists.editTitle') : t('settings.checklists.newTitle')}
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
        <TextField name="name" label={t('settings.checklists.name')} required autoFocus />
        <ItemRows />
      </FormSheet>
    </FormProvider>
  )
}

/** The items in order, each with its label, "required" and buttons to move or remove it. */
function ItemRows() {
  const { t } = useTranslation()
  const {
    control,
    formState: { errors },
  } = useFormContext<ChecklistTemplateFormValues>()
  const { fields, append, remove, move } = useFieldArray({ control, name: 'items' })
  // An empty list is the array's own error; each row has its own
  const listError = errors.items?.root?.message ?? errors.items?.message

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t('settings.checklists.items')}</legend>
      <ol className="space-y-3">
        {fields.map((field, index) => {
          const number = index + 1
          return (
            <li key={field.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <TextField
                  name={`items.${String(index)}.label`}
                  label={t('settings.checklists.item', { number })}
                  className="flex-1"
                />
                <div className="mt-6 flex shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    aria-label={t('settings.checklists.moveUp', { number })}
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
                    aria-label={t('settings.checklists.moveDown', { number })}
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
                    aria-label={t('settings.checklists.removeItem', { number })}
                    onClick={() => {
                      remove(index)
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <CheckboxField
                name={`items.${String(index)}.required`}
                label={t('settings.checklists.itemRequired')}
              />
            </li>
          )
        })}
      </ol>
      {listError && <FieldError>{listError}</FieldError>}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          append({ ...emptyChecklistItem })
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('settings.checklists.addItem')}
      </Button>
    </fieldset>
  )
}

function DeleteTemplateDialog({
  template,
  onClose,
}: {
  template: ChecklistTemplate | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteChecklistTemplate()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<ChecklistTemplate | null>(null)
  if (template && template !== last) {
    setLast(template)
    setError(null)
  }
  const name = (template ?? last)?.name ?? ''
  return (
    <ConfirmDialog
      open={template !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.checklists.delete.title')}
      description={t('settings.checklists.delete.description', { name })}
      confirmLabel={t('settings.checklists.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!template) return
        remove.mutate(template.id, {
          onSuccess: () => {
            toast.success(t('settings.checklists.delete.done', { name }))
            onClose()
          },
          onError: () => {
            setError(t('settings.checklists.delete.failed'))
          },
        })
      }}
    />
  )
}
