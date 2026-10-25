import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, RotateCcwIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { FormProvider, useController, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildTemplateSchema,
  insertAt,
  MESSAGE_KEYS,
  type MessageTemplate,
  type MessageTemplateKey,
  PLACEHOLDERS,
  placeholderText,
  templateFormValues,
  type TemplateFormValues,
  toTemplateBody,
  useCreateMessageTemplate,
  useDeleteMessageTemplate,
  useListMessageTemplates,
  usePreviewMessageTemplate,
  useUpdateMessageTemplate,
} from '@/entities/message-template'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
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
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { MessagePreview } from '@/shared/ui/message-preview'
import { Skeleton } from '@/shared/ui/skeleton'
import { Textarea } from '@/shared/ui/textarea'
import { TextField } from '@/shared/ui/text-field'

/** The messages the system sends to clients, grouped by what triggers them. */
export function MessagesSettings() {
  const { t } = useTranslation()
  const templates = useListMessageTemplates()
  const [editing, setEditing] = useState<MessageTemplate | null>(null)
  const [restoring, setRestoring] = useState<MessageTemplate | null>(null)

  const nameOf = (template: MessageTemplate) =>
    `${t(`settings.messages.keys.${template.key}`)} · ${t(`settings.messages.channels.${template.channel}`)}`

  return (
    <section aria-label={t('settings.messages.title')} className="max-w-3xl space-y-6">
      <ConfigListHeader
        title={t('settings.messages.title')}
        description={t('settings.messages.description')}
      />
      {templates.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.messages.loadFailed')}</AlertDescription>
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
        <Skeleton className="h-48" />
      ) : templates.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.messages.empty')}</ConfigListEmpty>
      ) : (
        MESSAGE_KEYS.map((key) => (
          <MessageGroup
            key={key}
            messageKey={key}
            templates={templates.data.filter((template) => template.key === key)}
            nameOf={nameOf}
            onEdit={setEditing}
            onRestore={setRestoring}
          />
        ))
      )}
      {editing && (
        <TemplateSheet
          template={editing}
          name={nameOf(editing)}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <RestoreDialog
        template={restoring}
        name={restoring ? nameOf(restoring) : ''}
        onClose={() => {
          setRestoring(null)
        }}
      />
    </section>
  )
}

function MessageGroup({
  messageKey,
  templates,
  nameOf,
  onEdit,
  onRestore,
}: {
  messageKey: MessageTemplateKey
  templates: MessageTemplate[]
  nameOf: (template: MessageTemplate) => string
  onEdit: (template: MessageTemplate) => void
  onRestore: (template: MessageTemplate) => void
}) {
  const { t } = useTranslation()
  if (templates.length === 0) return null
  const label = t(`settings.messages.keys.${messageKey}`)
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{label}</h3>
      <ConfigList label={t('settings.messages.list', { name: label })}>
        {templates
          .toSorted((a, b) => a.channel.localeCompare(b.channel))
          .map((template) => (
            <ConfigListItem
              key={template.id}
              title={
                <>
                  {t(`settings.messages.channels.${template.channel}`)}
                  {template.isDefault && (
                    <Badge variant="secondary" className="ml-2 align-middle">
                      {t('settings.messages.default')}
                    </Badge>
                  )}
                  {!template.isActive && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      {t('settings.messages.off')}
                    </Badge>
                  )}
                </>
              }
              meta={<span className="line-clamp-2 whitespace-pre-line">{template.body}</span>}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('settings.messages.edit', { name: nameOf(template) })}
                    onClick={() => {
                      onEdit(template)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  {!template.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('settings.messages.restore', { name: nameOf(template) })}
                      onClick={() => {
                        onRestore(template)
                      }}
                    >
                      <RotateCcwIcon aria-hidden="true" />
                    </Button>
                  )}
                </>
              }
            />
          ))}
      </ConfigList>
    </div>
  )
}

function TemplateSheet({
  template,
  name,
  onClose,
}: {
  template: MessageTemplate
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildTemplateSchema(template.channel), [template.channel])
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: templateFormValues(template),
  })
  const create = useCreateMessageTemplate()
  const update = useUpdateMessageTemplate()

  const submit = form.handleSubmit(async (values) => {
    const body = toTemplateBody(template, values)
    try {
      // A platform default is not the tenant's: its own text is written alongside
      if (template.isDefault) await create.mutateAsync(body)
      else await update.mutateAsync({ id: template.id, body })
      toast.success(t('settings.messages.saved'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        // The hook has refetched: the list shows the version that was saved meanwhile
        toast.error(t('settings.messages.exists'))
        onClose()
        return
      }
      reportSaveError(error, form, t('settings.messages.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('settings.messages.editTitle')}
        description={name}
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
        {template.channel === 'email' && (
          <TextField name="subject" label={t('settings.messages.subject')} required />
        )}
        <BodyField />
        <Preview channel={template.channel} />
        <CheckboxField name="isActive" label={t('settings.messages.isActive')} />
      </FormSheet>
    </FormProvider>
  )
}

/** The text, with a button for each placeholder that puts it in where the cursor is. */
function BodyField() {
  const { t } = useTranslation()
  const id = useId()
  const area = useRef<HTMLTextAreaElement | null>(null)
  const {
    field: { ref, name, value, onChange, onBlur },
    fieldState,
  } = useController<TemplateFormValues, 'body'>({ name: 'body' })
  const error = fieldState.error?.message

  const insert = (text: string) => {
    const element = area.current
    const result = insertAt(
      value,
      text,
      element?.selectionStart ?? value.length,
      element?.selectionEnd ?? value.length,
    )
    onChange(result.text)
    // The cursor goes after the inserted text once the field shows it
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {t('settings.messages.body')}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      </FieldLabel>
      <Textarea
        id={id}
        ref={(element) => {
          area.current = element
          ref(element)
        }}
        name={name}
        rows={6}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-required
      />
      <div
        role="group"
        aria-label={t('settings.messages.insert')}
        className="flex flex-wrap gap-1.5"
      >
        {PLACEHOLDERS.map((placeholder) => (
          <Button
            key={placeholder}
            type="button"
            size="xs"
            variant="outline"
            aria-label={t('settings.messages.insertPlaceholder', {
              name: t(`settings.messages.placeholders.${placeholder}`),
            })}
            onClick={() => {
              insert(placeholderText(placeholder))
            }}
          >
            {placeholderText(placeholder)}
          </Button>
        ))}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

/** The text as the client would get it, from sample data, once the typing stops. */
function Preview({ channel }: { channel: MessageTemplate['channel'] }) {
  const { t } = useTranslation()
  const body = useWatch<TemplateFormValues, 'body'>({ name: 'body' })
  const shown = useDebouncedValue(body, 400)
  const preview = usePreviewMessageTemplate(shown)
  return (
    <MessagePreview
      title={t('settings.messages.preview.title')}
      channel={channel}
      text={shown}
      data={preview.data}
      isError={preview.isError}
    />
  )
}

function RestoreDialog({
  template,
  name,
  onClose,
}: {
  template: MessageTemplate | null
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteMessageTemplate()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<{ template: MessageTemplate; name: string } | null>(null)
  if (template && template !== last?.template) {
    setLast({ template, name })
    setError(null)
  }
  const shownName = template ? name : (last?.name ?? '')
  return (
    <ConfirmDialog
      open={template !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.messages.restoreDialog.title')}
      description={t('settings.messages.restoreDialog.description', { name: shownName })}
      confirmLabel={t('settings.messages.restoreDialog.confirm')}
      confirmVariant="default"
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!template) return
        remove.mutate(template.id, {
          onSuccess: () => {
            toast.success(t('settings.messages.restoreDialog.done'))
            onClose()
          },
          onError: () => {
            setError(t('settings.messages.restoreDialog.failed'))
          },
        })
      }}
    />
  )
}
