import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMe, useSalesAccess } from '@/entities/auth'
import { type SalesTodayItem, useGetSalesToday } from '@/entities/deal'
import { useSalesMembers } from '@/entities/member'
import { useNow } from '@/shared/lib/use-now'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Field, FieldLabel } from '@/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'

/**
 * What is on the sales team's plate today, in the order the API gives (overdue first, then
 * by due time): follow-ups due, inquiries nobody answered, deals gone quiet. The reasons are
 * the API's; the prepared drafts and the review count belong to the AI and show only with
 * `sales_ai`. Owners may look at one person's list; for everyone else the API decides whose.
 */
export function SalesTodayView() {
  const { t } = useTranslation()
  const ownerId = useId()
  const me = useMe()
  const members = useSalesMembers()
  const { hasAi } = useSalesAccess()
  const { formatDate } = useTenantFormat()
  const [owner, setOwner] = useState('')
  const today = useGetSalesToday(owner ? { ownerUserId: owner } : {})
  const isOwner = me.role === 'owner'

  return (
    <section aria-label={t('sales.today.region')} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {today.data
            ? `${t('sales.today.title')}, ${formatDate(today.data.date)}`
            : t('sales.today.title')}
        </h2>
        {isOwner && (
          <Field className="w-auto max-md:w-full max-md:[&_select]:h-11">
            <FieldLabel htmlFor={ownerId}>{t('sales.today.owner')}</FieldLabel>
            <NativeSelect
              id={ownerId}
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value)
              }}
            >
              <NativeSelectOption value="">{t('sales.today.ownerAll')}</NativeSelectOption>
              {(members.data ?? []).map((member) => (
                <NativeSelectOption key={member.userId} value={member.userId}>
                  {member.fullName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
      </div>

      {today.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common.loading')}</span>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : today.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.today.loadFailed')}</AlertDescription>
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
      ) : (
        <>
          {hasAi && today.data.needsReviewCount > 0 && (
            <p className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="font-medium">
                {t('sales.today.review', { count: today.data.needsReviewCount })}
              </span>
              <Link
                to="/sales/inbox"
                search={{ card: 'review' }}
                className="underline-offset-2 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center max-md:font-medium"
              >
                {t('sales.today.reviewLink')}
              </Link>
            </p>
          )}
          {today.data.items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="font-medium">{t('sales.today.empty')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('sales.today.emptyHint')}</p>
            </div>
          ) : (
            <ol aria-label={t('sales.today.itemsTitle')} className="divide-y rounded-lg border">
              {today.data.items.map((item) => (
                <TodayRow key={`${item.reason}-${item.thread.id}`} item={item} showDraft={hasAi} />
              ))}
            </ol>
          )}
          <section aria-label={t('sales.today.stale')} className="space-y-2">
            <h3 className="font-semibold">{t('sales.today.stale')}</h3>
            {(today.data.staleDeals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('sales.today.staleEmpty')}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {(today.data.staleDeals ?? []).map((deal) => (
                  <li
                    key={deal.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <Link
                      to="/sales/deals/$id"
                      params={{ id: deal.id }}
                      aria-label={t('sales.today.openDeal', { title: deal.title })}
                      className="font-medium underline-offset-2 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
                    >
                      {deal.title}
                    </Link>
                    <span className="text-muted-foreground">
                      {[deal.stage.name, deal.client?.name ?? deal.contactName]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function TodayRow({ item, showDraft }: { item: SalesTodayItem; showDraft: boolean }) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const now = useNow()
  const overdue = item.dueAt != null && new Date(item.dueAt).getTime() < now
  return (
    <li data-testid="today-item" className="space-y-1 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={overdue ? 'destructive' : 'secondary'}>
          {t(`sales.today.reason.${item.reason}`)}
        </Badge>
        {overdue && <Badge variant="destructive">{t('sales.today.overdue')}</Badge>}
        {item.dueAt && (
          <span className="text-xs text-muted-foreground">
            {t('sales.today.due', { when: formatRelativeDateTime(item.dueAt) })}
          </span>
        )}
      </div>
      <Link
        to="/sales/inbox"
        search={{ card: 'all', thread: item.thread.id }}
        aria-label={t('sales.today.open', { subject: item.thread.subject })}
        className="block font-medium underline-offset-2 hover:underline max-md:flex max-md:min-h-11 max-md:items-center"
      >
        {item.thread.subject}
      </Link>
      <p className="truncate text-muted-foreground">{item.thread.snippet}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {item.deal && (
          <Link
            to="/sales/deals/$id"
            params={{ id: item.deal.id }}
            aria-label={t('sales.today.openDeal', { title: item.deal.title })}
            className="underline-offset-2 hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            {item.deal.title}
          </Link>
        )}
        {showDraft && item.draft && (
          <Badge variant="outline">
            {item.draft.status === 'generating'
              ? t('sales.today.draftGenerating')
              : t('sales.today.draftReady')}
          </Badge>
        )}
      </div>
    </li>
  )
}
