import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { type DealSummary, isFollowUpDue } from '@/entities/deal'
import { useNow } from '@/shared/lib/use-now'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Badge } from '@/shared/ui/badge'

/** One deal in a column: who, how much, and what needs attention. */
export function DealCard({
  deal,
  handle,
  footer,
}: {
  deal: DealSummary
  handle?: React.ReactNode
  /** Under the card's facts (on a phone: the control that moves it). */
  footer?: React.ReactNode
}) {
  const { t } = useTranslation()
  const { formatMoney, formatPhone, formatRelativeDateTime } = useTenantFormat()
  const who = deal.client?.name ?? deal.contactName ?? deal.contactEmail
  const due = isFollowUpDue(deal, useNow())
  return (
    <div className="flex gap-1 rounded-lg border bg-card p-2.5 text-sm shadow-xs">
      {handle}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Link
          to="/sales/deals/$id"
          params={{ id: deal.id }}
          className="block font-medium break-words hover:underline focus-visible:underline"
        >
          {deal.title}
        </Link>
        <p className="truncate text-muted-foreground">
          {who ?? t('sales.board.noClient')}
          {deal.contactPhone && !deal.client ? ` · ${formatPhone(deal.contactPhone)}` : ''}
        </p>
        {(deal.value ?? deal.owner) && (
          <p className="flex flex-wrap justify-between gap-x-3 text-xs">
            <span className="font-medium">{deal.value ? formatMoney(deal.value) : ''}</span>
            <span className="text-muted-foreground">{deal.owner?.fullName}</span>
          </p>
        )}
        {(deal.awaitingReply || deal.isStale || deal.nextFollowUpAt) && (
          <div className="flex flex-wrap gap-1">
            {deal.awaitingReply && (
              <Badge variant="secondary">{t('sales.board.awaitingReply')}</Badge>
            )}
            {deal.isStale && <Badge variant="outline">{t('sales.board.stale')}</Badge>}
            {deal.nextFollowUpAt && (
              <Badge variant={due ? 'destructive' : 'outline'}>
                {due
                  ? t('sales.board.followUpDue')
                  : t('sales.board.followUp', {
                      when: formatRelativeDateTime(deal.nextFollowUpAt),
                    })}
              </Badge>
            )}
          </div>
        )}
        {footer}
      </div>
    </div>
  )
}
