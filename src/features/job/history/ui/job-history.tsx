import { useQuery } from '@tanstack/react-query'
import { cn } from 'cn'
import { useTranslation } from 'react-i18next'

import {
  getJobHistory,
  JOB_HISTORY_STALE_TIME,
  jobKeys,
  type StatusHistoryEntry,
  StatusBadge,
} from '@/entities/job'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/** The job's status changes, newest first: who, when, and the note. */
export function JobHistory({ jobId, className }: { jobId: string; className?: string }) {
  const { t } = useTranslation()
  const history = useQuery({
    queryKey: jobKeys.history(jobId),
    queryFn: async ({ signal }) => {
      return getJobHistory(jobId, signal)
    },
    staleTime: JOB_HISTORY_STALE_TIME,
  })

  if (history.isPending) {
    return (
      <div aria-busy="true" className={cn('space-y-2', className)}>
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }
  if (history.isError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertDescription>{t('job.history.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void history.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (history.data.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>{t('job.history.empty')}</p>
    )
  }

  // The API returns oldest first
  const entries = [...history.data].reverse()
  return (
    <ol className={cn('space-y-3', className)} data-testid="job-history">
      {entries.map((entry) => (
        <HistoryEntry key={entry.id} entry={entry} />
      ))}
    </ol>
  )
}

function HistoryEntry({ entry }: { entry: StatusHistoryEntry }) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const who =
    entry.actor === 'client'
      ? t('job.history.client')
      : entry.actor === 'system'
        ? t('job.history.system')
        : (entry.changedBy?.fullName ?? t('job.history.unknownUser'))

  return (
    <li className="space-y-1 border-l-2 pl-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge status={entry.toStatus} />
        {entry.fromStatus && (
          <span className="text-xs text-muted-foreground">
            {t('job.history.from', { status: t(`job.status.${entry.fromStatus}`) })}
          </span>
        )}
      </div>
      <p className="text-muted-foreground">
        {who} · <time dateTime={entry.changedAt}>{formatRelativeDateTime(entry.changedAt)}</time>
      </p>
      {entry.note && <p className="whitespace-pre-line">{entry.note}</p>}
    </li>
  )
}
