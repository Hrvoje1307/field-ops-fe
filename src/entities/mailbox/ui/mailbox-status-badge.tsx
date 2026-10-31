import { useTranslation } from 'react-i18next'

import type { MailboxStatus } from '@/shared/api/generated/model'
import { Badge } from '@/shared/ui/badge'

const VARIANT = {
  connecting: 'secondary',
  active: 'outline',
  needs_reauth: 'destructive',
  error: 'destructive',
  disabled: 'secondary',
} as const satisfies Record<MailboxStatus, 'secondary' | 'outline' | 'destructive'>

/** The mailbox's status in words (the label is the platform's; the statuses are the contract's). */
export function MailboxStatusBadge({ status }: { status: MailboxStatus }) {
  const { t } = useTranslation()
  return <Badge variant={VARIANT[status]}>{t(`sales.mailboxes.status.${status}`)}</Badge>
}
