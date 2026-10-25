import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BOARD_STALE_TIME,
  type DispatchBoardColumnsItem,
  dispatchKeys,
  getDispatchBoard,
} from '@/entities/dispatch'
import { JobNumber, type JobSummary, PriorityMark, StatusBadge } from '@/entities/job'
import { TechnicianChip } from '@/entities/technician'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { minutesBetween } from '../lib/minutes'

/**
 * One day: the unassigned queue and a column per technician (working hours, load,
 * jobs in visit order). What a card can do comes from the caller (`jobActions`).
 */
export function DayBoard({
  date,
  jobActions,
}: {
  /** Tenant-local `yyyy-MM-dd`. */
  date: string
  jobActions?: (job: JobSummary) => ReactNode
}) {
  const { t } = useTranslation()
  const board = useQuery({
    queryKey: dispatchKeys.board(date),
    queryFn: async ({ signal }) => {
      return getDispatchBoard(date, signal)
    },
    staleTime: BOARD_STALE_TIME,
  })

  if (board.isPending) {
    return (
      <div aria-busy="true" className="flex gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    )
  }
  if (board.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('schedule.board.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void board.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
      <div className="flex min-w-max items-start gap-4">
        <Column
          title={t('schedule.board.queue')}
          subtitle={String(board.data.unassigned.length)}
          testId="queue"
          className="bg-muted/40"
        >
          {board.data.unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('schedule.board.queueEmpty')}</p>
          ) : (
            board.data.unassigned.map((job) => (
              <JobCard key={job.id} job={job} actions={jobActions?.(job)} queue />
            ))
          )}
        </Column>
        {board.data.columns.length === 0 && (
          <p className="self-center text-sm text-muted-foreground">
            {t('schedule.board.noTechnicians')}
          </p>
        )}
        {board.data.columns.map((column) => (
          <TechnicianColumn key={column.technician.id} column={column} jobActions={jobActions} />
        ))}
      </div>
    </div>
  )
}

function TechnicianColumn({
  column,
  jobActions,
}: {
  column: DispatchBoardColumnsItem
  jobActions?: (job: JobSummary) => ReactNode
}) {
  const { t } = useTranslation()
  const { formatDuration } = useTenantFormat()
  const available = minutesBetween(column.workStart, column.workEnd)
  const planned = column.plannedMinutes ?? 0
  const share = available > 0 ? Math.min(1, planned / available) : 0

  return (
    <Column
      title={<TechnicianChip technician={column.technician} />}
      label={column.technician.fullName}
      testId="technician-column"
      subtitle={
        column.isWorkingDay ? (
          <span className="space-y-1">
            <span className="block">
              {t('schedule.board.hours', { start: column.workStart, end: column.workEnd })} ·{' '}
              {t('schedule.board.load', {
                planned: formatDuration(planned),
                available: formatDuration(available),
              })}
            </span>
            <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full',
                  planned > available ? 'bg-destructive' : 'bg-primary',
                )}
                style={{ width: `${String(Math.round(share * 100))}%` }}
              />
            </span>
          </span>
        ) : (
          <span className="font-medium text-amber-800">{t('schedule.board.dayOff')}</span>
        )
      }
      className={column.isWorkingDay ? undefined : 'opacity-75'}
    >
      {column.jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('schedule.board.columnEmpty')}</p>
      ) : (
        column.jobs.map((job) => <JobCard key={job.id} job={job} actions={jobActions?.(job)} />)
      )}
    </Column>
  )
}

function Column({
  title,
  label,
  subtitle,
  children,
  testId,
  className,
}: {
  title: ReactNode
  /** Accessible name when the title isn't plain text. */
  label?: string
  subtitle: ReactNode
  children: ReactNode
  testId: string
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={label ? undefined : id}
      aria-label={label}
      data-testid={testId}
      className={cn('w-72 shrink-0 space-y-3 rounded-xl border p-3', className)}
    >
      <header className="space-y-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </header>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function JobCard({
  job,
  actions,
  queue = false,
}: {
  job: JobSummary
  actions?: ReactNode
  /** In the queue the client's wishes matter more than a time. */
  queue?: boolean
}) {
  const { t } = useTranslation()
  const { formatTime, formatRelativeDay } = useTenantFormat()
  return (
    <li
      className="space-y-1.5 rounded-lg border bg-background p-2.5 text-sm"
      data-testid="board-job"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium tabular-nums">
          {queue
            ? job.preferredDate
              ? t('schedule.board.preferred', { day: formatRelativeDay(job.preferredDate) })
              : null
            : job.scheduledStart
              ? formatTime(job.scheduledStart)
              : t('schedule.board.noTime')}
        </span>
        <StatusBadge status={job.status} />
      </div>
      <div className="flex items-start gap-1.5">
        <Link
          to="/jobs/$jobId"
          params={{ jobId: job.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {job.title}
        </Link>
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
    </li>
  )
}
