import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { canSchedule, ScheduleJobButton } from '@/features/job/assign'
import { DayBoard } from '@/features/schedule/day-board'
import { addDays, isPlainDate } from '@/shared/lib/datetime'
import { useTenantFormat } from '@/shared/lib/tenant-format'
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
