import { useTranslation } from 'react-i18next'

import type { MessageStatus } from '@/shared/api/generated/model'
import { Badge } from '@/shared/ui/badge'

const VARIANTS: Record<MessageStatus, 'secondary' | 'outline' | 'destructive'> = {
  queued: 'outline',
  sent: 'secondary',
  delivered: 'secondary',
  failed: 'destructive',
  undeliverable: 'destructive',
}

/** Where a message is: in line, on its way, arrived, or lost. */
export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const { t } = useTranslation()
  return (
    <Badge variant={VARIANTS[status]} data-status={status}>
      {t(`message.status.${status}`)}
    </Badge>
  )
}
