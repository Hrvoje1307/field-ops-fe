import { Link } from '@tanstack/react-router'
import { LockIcon, LockOpenIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { canSchedule, JobNumber, type JobSummary, PriorityMark, StatusBadge } from '@/entities/job'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'

/**
 * What a card shows: time (or the client's wishes in the queue), status, title,
 * client, address, window. The grip and the buttons come from the caller.
 */
export function JobCardBody({
  job,
  queue = false,
  handle,
  actions,
  onToggleLock,
  linked = true,
}: {
  job: JobSummary
  /** In the queue the client's wishes matter more than a time. */
  queue?: boolean
  handle?: ReactNode
  actions?: ReactNode
  /** Shown on scheduled jobs; flips the lock. */
  onToggleLock?: () => void
  /** The dragged copy has no link to click. */
  linked?: boolean
}) {
  const { t } = useTranslation()
  const { formatTime, formatRelativeDay } = useTenantFormat()
  const lockable = onToggleLock && !queue && canSchedule(job.status)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium tabular-nums">
          {handle}
          {queue
            ? job.preferredDate
              ? t('schedule.board.preferred', { day: formatRelativeDay(job.preferredDate) })
              : null
            : job.scheduledStart
              ? formatTime(job.scheduledStart)
              : t('schedule.board.noTime')}
        </span>
        <span className="flex items-center gap-1.5">
          {lockable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-pressed={job.locked}
              aria-label={
                job.locked
                  ? t('schedule.board.unlockJob', { number: job.number })
                  : t('schedule.board.lockJob', { number: job.number })
              }
              onClick={onToggleLock}
            >
              {job.locked ? <LockIcon aria-hidden="true" /> : <LockOpenIcon aria-hidden="true" />}
            </Button>
          ) : (
            job.locked && (
              <LockIcon
                role="img"
                aria-label={t('schedule.board.locked')}
                className="size-3.5 text-muted-foreground"
              />
            )
          )}
          <StatusBadge status={job.status} />
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        {linked ? (
          <Link
            to="/jobs/$jobId"
            params={{ jobId: job.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {job.title}
          </Link>
        ) : (
          <span className="font-medium">{job.title}</span>
        )}
        <PriorityMark priority={job.priority} iconOnly className="mt-0.5" />
      </div>
      <p className="text-xs text-muted-foreground">
        <JobNumber number={job.number} /> · {job.client.name}
        <span className="block">{job.location.address}</span>
        {job.windowStart && job.windowEnd && (
          <span className="block">
            {t('schedule.board.window', { start: job.windowStart, end: job.windowEnd })}
          </span>
        )}
      </p>
      {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
    </div>
  )
}
