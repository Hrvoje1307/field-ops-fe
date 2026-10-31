import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { useSalesMembers } from '@/entities/member'
import {
  buildOAuthSchema,
  MailboxKindFields,
  type OAuthFormValues,
  toOAuthStartBody,
  useStartMailboxOAuth,
} from '@/entities/mailbox'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { FormSheet } from '@/shared/ui/form-sheet'
import { TextField } from '@/shared/ui/text-field'

type OAuthProvider = 'gmail' | 'microsoft'

/**
 * "Spoji sandučić": Gmail and Microsoft 365 go through the provider's consent page (the
 * browser navigates to the `authorizeUrl` the API gives), anything else is the IMAP form
 * the screen shows (`onImap`).
 */
export function ConnectMailboxButton({
  onImap,
  variant = 'default',
}: {
  onImap: () => void
  variant?: 'default' | 'outline'
}) {
  const { t } = useTranslation()
  const [provider, setProvider] = useState<OAuthProvider | null>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant}>
            <PlusIcon aria-hidden="true" />
            {t('sales.mailboxes.connect')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(['gmail', 'microsoft'] as const).map((value) => (
            <DropdownMenuItem
              key={value}
              onSelect={() => {
                setProvider(value)
              }}
            >
              {t(`sales.mailboxes.connectWith.${value}`)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={onImap}>
            {t('sales.mailboxes.connectWith.imap')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {provider && (
        <OAuthSheet
          provider={provider}
          onClose={() => {
            setProvider(null)
          }}
        />
      )}
    </>
  )
}

function OAuthSheet({ provider, onClose }: { provider: OAuthProvider; onClose: () => void }) {
  const { t } = useTranslation()
  const members = useSalesMembers()
  const owners = useMemo(
    () => (members.data ?? []).map((member) => ({ id: member.userId, name: member.fullName })),
    [members.data],
  )
  const schema = useMemo(() => buildOAuthSchema(), [])
  const form = useForm<OAuthFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'shared', ownerUserId: '', syncFrom: '' },
  })
  const start = useStartMailboxOAuth()

  const submit = form.handleSubmit(async (values) => {
    try {
      const { authorizeUrl } = await start.mutateAsync(toOAuthStartBody(provider, values))
      // The provider's page is outside the app: go there, it brings the browser back
      window.location.assign(authorizeUrl)
    } catch (error) {
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.oauthStartFailed'),
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
        title={t('sales.mailboxes.oauthTitle', {
          provider: t(`sales.mailboxes.provider.${provider}`),
        })}
        description={t('sales.mailboxes.oauthDescription')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting || start.isSuccess}>
              {form.formState.isSubmitting || start.isSuccess
                ? t('sales.mailboxes.oauthStarting')
                : t('sales.mailboxes.oauthContinue')}
            </Button>
          </>
        }
      >
        <MailboxKindFields owners={owners} />
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
