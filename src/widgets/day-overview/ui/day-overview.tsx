import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ScheduleJobButton } from '@/features/job/assign'
import { canSchedule } from '@/entities/job'
import { DayBoard } from '@/features/schedule/day-board'
import { OptimizeDayButton } from '@/features/schedule/route-plan'
import { useGetDispatchBoard } from '@/entities/dispatch'
import { addDays, isPlainDate } from '@/shared/lib/datetime'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

/**
 * The office's day: navigation between days, the unassigned queue and the
 * technicians' columns, with scheduling on every card.
 */
export function DayOverview({
  date,
  onDateChange,
}: {
  /** Tenant-local `yyyy-MM-dd`. */
  date: string
  onDateChange: (date: string) => void
}) {
  return (
    <div className="space-y-6">
      <DayNavigator date={date} onDateChange={onDateChange} />
      <PlanBanner date={date} />
      <DayBoard
        date={date}
        jobActions={(job) =>
          canSchedule(job.status) ? (
            <ScheduleJobButton
              jobId={job.id}
              number={job.number}
              scheduled={job.technicians.length > 0}
              day={date}
            />
          ) : null
        }
      />
    </div>
  )
}

function DayNavigator({
  date,
  onDateChange,
}: {
  date: string
  onDateChange: (date: string) => void
}) {
  const { t } = useTranslation()
  const { formatDate, formatRelativeDay, today } = useTenantFormat()
  const id = useId()
  const isToday = date === today()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{formatRelativeDay(date)}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OptimizeDayButton date={date} />
        <Button
          variant="outline"
          size="icon"
          aria-label={t('schedule.board.previousDay')}
          onClick={() => {
            onDateChange(addDays(date, -1))
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <label htmlFor={id} className="sr-only">
          {t('schedule.board.date')}
        </label>
        <Input
          id={id}
          type="date"
          className="w-auto"
          value={date}
          onChange={(event) => {
            if (isPlainDate(event.target.value)) onDateChange(event.target.value)
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={t('schedule.board.nextDay')}
          onClick={() => {
            onDateChange(addDays(date, 1))
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          disabled={isToday}
          onClick={() => {
            onDateChange(today())
          }}
        >
          {t('schedule.board.today')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Says when the day has a draft plan waiting to be reviewed, or a published one, and
 * links to it. The board reports the plans of the day.
 */
function PlanBanner({ date }: { date: string }) {
  const { t } = useTranslation()
  const board = useGetDispatchBoard(date)
  const draftId = board.data?.draftPlanId
  const publishedId = board.data?.publishedPlanId
  if (!draftId && !publishedId) return null
  return (
    <div className="space-y-2">
      {draftId && (
        <Alert data-testid="draft-plan-banner">
          <AlertDescription>{t('schedule.plan.draftBanner')}</AlertDescription>
          <AlertAction>
            <Button asChild size="sm" variant="outline">
              <Link to="/plans/$planId" params={{ planId: draftId }}>
                {t('schedule.plan.openDraft')}
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      )}
      {publishedId && (
        <Alert data-testid="published-plan-banner">
          <AlertDescription>{t('schedule.plan.publishedBanner')}</AlertDescription>
          <AlertAction>
            <Button asChild size="sm" variant="outline">
              <Link to="/plans/$planId" params={{ planId: publishedId }}>
                {t('schedule.plan.openPublished')}
              </Link>
            </Button>
          </AlertAction>
        </Alert>
      )}
    </div>
  )
}
