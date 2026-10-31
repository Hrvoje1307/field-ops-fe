import { zodResolver } from '@hookform/resolvers/zod'
import { CopyIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { hasSalesPlan, useMe } from '@/entities/auth'
import {
  buildInvitationSchema,
  emptyInvitation,
  type Invitation,
  type InvitationFormValues,
  ROLES,
  toInvitationBody,
  useCreateInvitation,
} from '@/entities/member'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Input } from '@/shared/ui/input'
import { SelectField } from '@/shared/ui/select-field'
import { TextField } from '@/shared/ui/text-field'

/**
 * Invites a person by e-mail. When the server cannot send e-mail it returns the link,
 * and the sheet shows it to be passed on by hand.
 */
export function InviteSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildInvitationSchema(), [])
  const form = useForm<InvitationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyInvitation,
  })
  const create = useCreateInvitation()
  const planHasSales = hasSalesPlan(useMe())
  const role = useWatch({ control: form.control, name: 'role' })
  const [sent, setSent] = useState<Invitation | null>(null)

  const submit = form.handleSubmit(async (values) => {
    try {
      const invitation = await create.mutateAsync(toInvitationBody(values))
      if (invitation.inviteUrl) {
        setSent(invitation)
        return
      }
      toast.success(t('settings.team.invitations.new.sent'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        form.setError('email', { message: t('settings.team.invitations.new.exists') })
        return
      }
      reportSaveError(error, form, t('settings.team.invitations.new.failed'))
    }
  })

  if (sent?.inviteUrl) {
    const url = sent.inviteUrl
    return (
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('settings.team.invitations.new.title')}
        description={sent.email}
        onSubmit={(event) => {
          event.preventDefault()
          onClose()
        }}
        footer={<Button type="submit">{t('settings.team.invitations.new.done')}</Button>}
      >
        <Alert>
          <AlertDescription>{t('settings.team.invitations.new.link')}</AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <Input readOnly value={url} aria-label={t('settings.team.invitations.new.link')} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(url).then(
                () => {
                  toast.success(t('settings.team.invitations.new.copied'))
                },
                () => {
                  toast.error(t('settings.team.invitations.new.copyFailed'))
                },
              )
            }}
          >
            <CopyIcon aria-hidden="true" />
            {t('settings.team.invitations.new.copy')}
          </Button>
        </div>
      </FormSheet>
    )
  }

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('settings.team.invitations.new.title')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t('settings.team.invitations.new.sending')
                : t('settings.team.invitations.new.send')}
            </Button>
          </>
        }
      >
        <TextField
          name="email"
          type="email"
          autoComplete="off"
          label={t('settings.team.invitations.new.email')}
          required
          autoFocus
        />
        <SelectField
          name="role"
          label={t('settings.team.invitations.new.role')}
          emptyLabel={t('customField.choose')}
          options={ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
          required
        />
        {planHasSales && role === 'dispatcher' && (
          <CheckboxField
            name="canAccessSales"
            label={t('settings.team.invitations.new.salesAccess')}
            hint={t('settings.team.invitations.new.salesAccessHint')}
          />
        )}
      </FormSheet>
    </FormProvider>
  )
}
