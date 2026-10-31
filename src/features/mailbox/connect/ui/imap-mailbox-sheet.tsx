import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildImapSchema,
  imapFormValues,
  type ImapFormValues,
  type Mailbox,
  MailboxKindFields,
  toImapBody,
  useCreateImapMailbox,
} from '@/entities/mailbox'
import { useSalesMembers } from '@/entities/member'
import { ApiError } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { FormSheet } from '@/shared/ui/form-sheet'
import { FieldRow, TextField } from '@/shared/ui/text-field'

const SECURITIES = ['ssl', 'starttls'] as const

/**
 * Connects an IMAP/SMTP mailbox. The server tests both connections before saving (422 with
 * its message), the form keeps everything but the password after a failure. With `mailbox`
 * it starts from that mailbox (a reconnect): only address, name, kind and owner are known,
 * the servers and the password are typed again.
 */
export function ImapMailboxSheet({ mailbox, onClose }: { mailbox?: Mailbox; onClose: () => void }) {
  const { t } = useTranslation()
  const members = useSalesMembers()
  const owners = useMemo(
    () => (members.data ?? []).map((member) => ({ id: member.userId, name: member.fullName })),
    [members.data],
  )
  const schema = useMemo(() => buildImapSchema(), [])
  const form = useForm<ImapFormValues>({
    resolver: zodResolver(schema),
    defaultValues: imapFormValues(mailbox),
  })
  const create = useCreateImapMailbox()

  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(toImapBody(values))
      toast.success(t('sales.mailboxes.imapConnected'))
      onClose()
    } catch (error) {
      // The password is never kept: it is typed again for the next try
      form.resetField('password', { defaultValue: '' })
      if (mailbox && salesErrorCode(error) === 'sales.mailbox_exists') {
        toast.error(t('sales.mailboxes.imapReconnectExists'))
        return
      }
      if (error instanceof ApiError && error.status === 400) {
        reportSaveError(error, form, t('sales.mailboxes.imapFailed'))
        return
      }
      toast.error(
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.imapFailed'),
      )
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={mailbox ? t('sales.mailboxes.imapReconnectTitle') : t('sales.mailboxes.imapTitle')}
        description={t('sales.mailboxes.imapDescription')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t('sales.mailboxes.imapConnecting')
                : t('sales.mailboxes.imapConnect')}
            </Button>
          </>
        }
      >
        {mailbox && (
          <Alert>
            <AlertDescription>{t('sales.mailboxes.imapReconnectNote')}</AlertDescription>
          </Alert>
        )}
        <TextField
          name="emailAddress"
          label={t('sales.mailboxes.emailAddress')}
          type="email"
          required
          autoComplete="off"
        />
        <TextField name="displayName" label={t('sales.mailboxes.displayName')} autoComplete="off" />
        <MailboxKindFields owners={owners} />
        <ServerFields prefix="imap" legend={t('sales.mailboxes.imap')} />
        <ServerFields prefix="smtp" legend={t('sales.mailboxes.smtp')} />
        <TextField
          name="username"
          label={t('sales.mailboxes.username')}
          required
          autoComplete="off"
        />
        <TextField
          name="password"
          type="password"
          label={t('sales.mailboxes.password')}
          hint={t('sales.mailboxes.passwordHint')}
          required
          autoComplete="new-password"
        />
        <TextField
          name="syncFrom"
          type="date"
          label={t('sales.mailboxes.syncFrom')}
          hint={t('sales.mailboxes.syncFromHint')}
        />
      </FormSheet>
    </FormProvider>
  )
}

/** Host, port and protection of one of the two connections. */
function ServerFields({ prefix, legend }: { prefix: 'imap' | 'smtp'; legend: string }) {
  const { t } = useTranslation()
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <FieldRow>
        <TextField
          name={`${prefix}Host`}
          label={t('sales.mailboxes.host')}
          required
          autoComplete="off"
        />
        <TextField
          name={`${prefix}Port`}
          label={t('sales.mailboxes.port')}
          inputMode="numeric"
          required
          autoComplete="off"
        />
      </FieldRow>
      <ChoiceGroup
        name={`${prefix}Security`}
        legend={t('sales.mailboxes.security')}
        choices={SECURITIES.map((value) => ({
          value,
          label: t(`sales.mailboxes.securityChoice.${value}`),
        }))}
      />
    </fieldset>
  )
}
