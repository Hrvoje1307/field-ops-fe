import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useMe } from '@/entities/auth'
import { useGetJob } from '@/entities/job'
import {
  addressOf,
  buildNotifySchema,
  emptyNotify,
  type NotifyFormValues,
  recipientsOf,
  canReach,
  toNotifyBody,
  useNotifyClient,
} from '@/entities/message'
import { useListMessageTemplates, usePreviewMessageTemplate } from '@/entities/message-template'
import { ApiError } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { FormSheet } from '@/shared/ui/form-sheet'
import { MessagePreview } from '@/shared/ui/message-preview'
import { SelectField } from '@/shared/ui/select-field'
import { TextField } from '@/shared/ui/text-field'

/** What the API said was wrong, in words for the person sending. */
function problemText(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 422) {
    const code = (error.problem as { code?: string }).code
    if (code === 'notify.sms_disabled') return t('job.messages.problems.smsDisabled')
    if (code === 'notify.no_recipient') return t('job.messages.problems.noRecipient')
    if (code === 'notify.no_template') return t('job.messages.problems.noTemplate')
  }
  return t('job.messages.problems.failed')
}

/** Sends the client of a job a message: a template of the tenant's or text for this once. */
export function SendMessageSheet({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const me = useMe()
  const job = useGetJob(jobId)
  const templates = useListMessageTemplates()
  const send = useNotifyClient()
  const [problem, setProblem] = useState<string | null>(null)
  const smsAvailable = me.features?.includes('sms') ?? false
  const schema = useMemo(() => buildNotifySchema(), [])
  const form = useForm<NotifyFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...emptyNotify, channel: smsAvailable ? 'sms' : 'email' },
  })
  const [channel, source, templateKey, body, contactId] = useWatch({
    control: form.control,
    name: ['channel', 'source', 'templateKey', 'body', 'contactId'],
  })
  const contacts = job.data?.clientDetail?.contacts ?? []
  const reachable = contacts.filter((contact) => canReach(contact, channel))
  const recipients = recipientsOf(contacts, channel, contactId)

  // The templates that can be sent by this channel
  const offered = (templates.data ?? []).filter((x) => x.channel === channel && x.isActive)
  const chosen = offered.find((x) => x.key === templateKey)
  const previewText = source === 'template' ? (chosen?.body ?? '') : body
  const shown = useDebouncedValue(previewText, 400)
  const preview = usePreviewMessageTemplate(shown, jobId)

  const submit = form.handleSubmit(async (values) => {
    setProblem(null)
    try {
      const made = await send.mutateAsync({ jobId, body: toNotifyBody(values) })
      toast.success(t('job.messages.sent', { count: made.length }))
      onClose()
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        reportSaveError(error, form, t('job.messages.problems.failed'))
        return
      }
      setProblem(problemText(error, t))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('job.messages.sendTitle')}
        description={job.data ? `${job.data.number} · ${job.data.title}` : undefined}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || recipients.length === 0}>
              {form.formState.isSubmitting
                ? t('job.messages.sending')
                : t('job.messages.sendAction')}
            </Button>
          </>
        }
      >
        {problem && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        )}
        <ChoiceGroup
          name="channel"
          legend={t('job.messages.channel')}
          choices={[
            ...(smsAvailable ? [{ value: 'sms', label: t('settings.messages.channels.sms') }] : []),
            { value: 'email', label: t('settings.messages.channels.email') },
          ]}
        />
        <ChoiceGroup
          name="source"
          legend={t('job.messages.source')}
          choices={[
            { value: 'template', label: t('job.messages.sources.template') },
            { value: 'text', label: t('job.messages.sources.text') },
          ]}
        />
        {source === 'template' ? (
          <SelectField
            name="templateKey"
            label={t('job.messages.template')}
            emptyLabel={t('customField.choose')}
            options={offered.map((x) => ({
              value: x.key,
              label: t(`settings.messages.keys.${x.key}`),
            }))}
            required
          />
        ) : (
          <TextField name="body" label={t('job.messages.text')} rows={5} required />
        )}
        <SelectField
          name="contactId"
          label={t('job.messages.to')}
          emptyLabel={t('job.messages.toAll', { count: recipients.length })}
          options={reachable.map((contact) => ({
            value: contact.id,
            label: `${contact.name} · ${addressOf(contact, channel)}`,
          }))}
        />
        {recipients.length === 0 ? (
          <Alert role="status">
            <AlertDescription>{t('job.messages.problems.noRecipient')}</AlertDescription>
          </Alert>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="message-recipients">
            {t('job.messages.goesTo', {
              to: recipients.map((contact) => addressOf(contact, channel)).join(', '),
            })}
          </p>
        )}
        <MessagePreview
          title={t('job.messages.preview')}
          channel={channel}
          text={shown}
          data={preview.data}
          isError={preview.isError}
        />
      </FormSheet>
    </FormProvider>
  )
}
