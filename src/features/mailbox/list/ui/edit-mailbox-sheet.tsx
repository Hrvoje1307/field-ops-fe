import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import {
  type Mailbox,
  type MailboxKind,
  MailboxKindFields,
  toMailboxUpdate,
  useUpdateMailbox,
} from '@/entities/mailbox'
import { useSalesMembers } from '@/entities/member'
import { i18n } from '@/shared/i18n'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Button } from '@/shared/ui/button'
import { FormSheet } from '@/shared/ui/form-sheet'
import { TextField } from '@/shared/ui/text-field'

interface EditValues {
  displayName: string
  kind: MailboxKind
  ownerUserId: string
}

/** Rename a mailbox, change whether it is shared or personal and whose it is. */
export function EditMailboxSheet({ mailbox, onClose }: { mailbox: Mailbox; onClose: () => void }) {
  const { t } = useTranslation()
  const members = useSalesMembers()
  const owners = useMemo(
    () => (members.data ?? []).map((member) => ({ id: member.userId, name: member.fullName })),
    [members.data],
  )
  const schema = useMemo(
    () =>
      z
        .object({
          displayName: z.string().trim().min(1, i18n.t('sales.mailboxes.errors.nameRequired')),
          kind: z.enum(['shared', 'personal']),
          ownerUserId: z.string(),
        })
        .refine((value) => value.kind === 'shared' || value.ownerUserId !== '', {
          path: ['ownerUserId'],
          message: i18n.t('sales.mailboxes.errors.ownerRequired'),
        }),
    [],
  )
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: mailbox.displayName,
      kind: mailbox.kind,
      ownerUserId: mailbox.owner?.id ?? '',
    },
  })
  const update = useUpdateMailbox()

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        id: mailbox.id,
        body: toMailboxUpdate(mailbox, {
          displayName: values.displayName,
          kind: values.kind,
          ownerUserId: values.kind === 'personal' ? values.ownerUserId : null,
        }),
      })
      toast.success(t('sales.mailboxes.saved'))
      onClose()
    } catch (error) {
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.updateFailed'),
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
        title={t('sales.mailboxes.editTitle')}
        description={mailbox.emailAddress}
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
        <TextField
          name="displayName"
          label={t('sales.mailboxes.displayName')}
          required
          autoComplete="off"
        />
        <MailboxKindFields owners={owners} />
      </FormSheet>
    </FormProvider>
  )
}
