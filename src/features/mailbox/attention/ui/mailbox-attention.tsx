import { Link } from '@tanstack/react-router'
import { AlertTriangleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/auth'
import { useGetSalesToday } from '@/entities/deal'
import { salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/**
 * Mailboxes that need someone: `needs_reauth` or `error` (`SalesToday.mailboxesNeedingAttention`,
 * which only lists the ones the user may see). Connecting a mailbox is the owner's, so the
 * owner gets a link to the page and everyone else is told to tell them, with no button.
 * Nothing shows while it loads or when all is well; a failed request says so.
 */
export function MailboxAttention() {
  const { t } = useTranslation()
  const me = useMe()
  const today = useGetSalesToday()

  if (today.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{salesErrorMessage(today.error)}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void today.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  const mailboxes = today.data?.mailboxesNeedingAttention ?? []
  if (mailboxes.length === 0) return null

  return (
    <Alert role="status" aria-label={t('sales.attention.region')} data-testid="mailbox-attention">
      <AlertTriangleIcon aria-hidden="true" />
      <AlertDescription>
        <ul className="space-y-1">
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id}>
              {t(
                `sales.attention.${mailbox.status === 'needs_reauth' ? 'needs_reauth' : 'error'}`,
                {
                  name: mailbox.displayName,
                  address: mailbox.emailAddress,
                },
              )}
              {mailbox.lastError && (
                <span className="block">
                  {t('sales.attention.lastError', { message: mailbox.lastError })}
                </span>
              )}
            </li>
          ))}
        </ul>
        {me.role !== 'owner' && (
          <p className="mt-1 font-medium">{t('sales.attention.tellOwner')}</p>
        )}
      </AlertDescription>
      {me.role === 'owner' && (
        <AlertAction>
          <Button asChild size="sm" variant="outline">
            <Link to="/settings/sales/mailboxes">{t('sales.attention.ownerAction')}</Link>
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
