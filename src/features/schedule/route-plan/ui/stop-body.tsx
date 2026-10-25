import { Link } from '@tanstack/react-router'
import { LockIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { RoutePlanUnassignedItem } from '@/entities/dispatch'
import { JobNumber, type JobSummary, PriorityMark, useGetJob } from '@/entities/job'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Skeleton } from '@/shared/ui/skeleton'

export interface StopTimes {
  eta?: string | null
  etd?: string | null
  travelFromPrevS?: number | null
}

/**
 * A job in a route: planned arrival and departure, the drive before it, what the job
 * is. The job comes from the day's board; one that is not there is fetched.
 */
export function StopBody({
  jobId,
  job,
  times,
  unplaced,
  handle,
  linked = true,
}: {
  jobId: string
  /** From the day's board, when it is there. */
  job: JobSummary | undefined
  times?: StopTimes
  /** Why the plan left the job out. */
  unplaced?: RoutePlanUnassignedItem
  handle?: ReactNode
  linked?: boolean
}) {
  const { t } = useTranslation()
  const { formatTime, formatDuration } = useTenantFormat()
  const fetched = useGetJob(jobId, { enabled: !job })
  const shown = job ?? fetched.data

  if (!shown) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium tabular-nums">
          {handle}
          {times?.eta
            ? times.etd
              ? `${formatTime(times.eta)}–${formatTime(times.etd)}`
              : t('schedule.plan.arrival', { time: formatTime(times.eta) })
            : null}
        </span>
        {shown.locked && (
          <LockIcon
            role="img"
            aria-label={t('schedule.board.locked')}
            className="size-3.5 text-muted-foreground"
          />
        )}
      </div>
      {times?.travelFromPrevS != null && times.travelFromPrevS > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('schedule.plan.travel', {
            duration: formatDuration(Math.ceil(times.travelFromPrevS / 60)),
          })}
        </p>
      )}
      <div className="flex items-start gap-1.5">
        {linked ? (
          <Link
            to="/jobs/$jobId"
            params={{ jobId: shown.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {shown.title}
          </Link>
        ) : (
          <span className="font-medium">{shown.title}</span>
        )}
        <PriorityMark priority={shown.priority} iconOnly className="mt-0.5" />
      </div>
      <p className="text-xs text-muted-foreground">
        <JobNumber number={shown.number} /> · {shown.client.name}
        <span className="block">{shown.location.address}</span>
      </p>
      {unplaced && (
        <p className="text-xs text-amber-800">
          <span className="font-medium">{t(`schedule.plan.reasons.${unplaced.reason}`)}</span>
          {unplaced.detail ? `: ${unplaced.detail}` : null}
        </p>
      )}
    </div>
  )
}
