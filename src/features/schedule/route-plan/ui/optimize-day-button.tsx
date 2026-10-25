import { useNavigate } from '@tanstack/react-router'
import type { TFunction } from 'i18next'
import { RouteIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type DispatchBoard, useGetDispatchBoard, useOptimizeRoutePlan } from '@/entities/dispatch'
import { useMe } from '@/entities/auth'
import { JobNumber, type JobSummary } from '@/entities/job'
import { TechnicianChip } from '@/entities/technician'
import { ApiError } from '@/shared/api/api-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Skeleton } from '@/shared/ui/skeleton'
import { Spinner } from '@/shared/ui/spinner'

import { optimizeChoices } from '../lib/optimize-choices'

/** The plan feature that route optimisation needs (`Me.features`). */
const FEATURE = 'route_optimization'

/**
 * "Optimiraj dan": choose technicians and jobs, let the solver propose routes (a few
 * seconds), then review the draft on its own page. Unavailable when the tenant's plan
 * has no optimisation.
 */
export function OptimizeDayButton({ date }: { date: string }) {
  const { t } = useTranslation()
  const me = useMe()
  const [open, setOpen] = useState(false)
  const included = me.features?.includes(FEATURE) ?? false
  const hintId = useId()
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={!included}
        aria-describedby={included ? undefined : hintId}
        onClick={() => {
          setOpen(true)
        }}
      >
        <RouteIcon aria-hidden="true" />
        {t('schedule.plan.optimize.open')}
      </Button>
      {!included && (
        <span id={hintId} className="text-xs text-muted-foreground">
          {t('schedule.plan.optimize.notIncluded')}
        </span>
      )}
      {open && (
        <OptimizeDialog
          date={date}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function OptimizeDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { t } = useTranslation()
  const board = useGetDispatchBoard(date)
  const optimize = useOptimizeRoutePlan()
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !optimize.isPending) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('schedule.plan.optimize.title')}</DialogTitle>
          <DialogDescription>{t('schedule.plan.optimize.description')}</DialogDescription>
        </DialogHeader>
        {board.isPending ? (
          <div aria-busy="true" className="space-y-2">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : board.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{t('schedule.plan.optimize.loadFailed')}</AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline" onClick={() => void board.refetch()}>
                {t('common.retry')}
              </Button>
            </AlertAction>
          </Alert>
        ) : (
          <OptimizeForm date={date} board={board.data} optimize={optimize} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function OptimizeForm({
  date,
  board,
  optimize,
  onClose,
}: {
  date: string
  board: DispatchBoard
  optimize: ReturnType<typeof useOptimizeRoutePlan>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const choices = optimizeChoices(board)
  const [technicianIds, setTechnicianIds] = useState(
    () => new Set(choices.working.map((column) => column.technician.id)),
  )
  const [jobIds, setJobIds] = useState(
    () => new Set([...choices.queued, ...choices.scheduled].map((job) => job.id)),
  )
  const running = optimize.isPending
  const ready = technicianIds.size > 0 && jobIds.size > 0

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }

  function start() {
    optimize.mutate(
      { date, technicianIds: [...technicianIds], jobIds: [...jobIds] },
      {
        onSuccess: (plan) => {
          onClose()
          void navigate({ to: '/plans/$planId', params: { planId: plan.id } })
        },
      },
    )
  }

  const jobList = (title: string, jobs: JobSummary[]) => (
    <fieldset className="space-y-1.5" disabled={running}>
      <legend className="text-sm font-medium">{title}</legend>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('schedule.plan.optimize.none')}</p>
      ) : (
        jobs.map((job) => (
          <label key={job.id} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={jobIds.has(job.id)}
              onChange={(event) => {
                setJobIds(toggle(jobIds, job.id, event.target.checked))
              }}
              aria-label={`${job.number} ${job.title}`}
            />
            <span>
              <JobNumber number={job.number} /> {job.title}
              <span className="block text-xs text-muted-foreground">
                {job.client.name} · {job.location.address}
                {job.locked && ` · ${t('schedule.plan.optimize.locked')}`}
                {job.requiredPeople > 1 &&
                  ` · ${t('schedule.plan.optimize.crew', { count: job.requiredPeople })}`}
              </span>
            </span>
          </label>
        ))
      )}
    </fieldset>
  )

  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5" disabled={running}>
        <legend className="text-sm font-medium">{t('schedule.plan.optimize.technicians')}</legend>
        {choices.working.map((column) => (
          <label key={column.technician.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={technicianIds.has(column.technician.id)}
              onChange={(event) => {
                setTechnicianIds(toggle(technicianIds, column.technician.id, event.target.checked))
              }}
              aria-label={column.technician.fullName}
            />
            <TechnicianChip technician={column.technician} />
          </label>
        ))}
        {choices.dayOff.map((column) => (
          <label
            key={column.technician.id}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <input type="checkbox" disabled aria-label={column.technician.fullName} />
            <TechnicianChip technician={column.technician} />
            <span className="text-xs">{t('schedule.plan.optimize.dayOff')}</span>
          </label>
        ))}
      </fieldset>
      {jobList(t('schedule.plan.optimize.queuedJobs'), choices.queued)}
      {jobList(t('schedule.plan.optimize.scheduledJobs'), choices.scheduled)}

      {optimize.isError && (
        <Alert role="alert" variant="destructive">
          <AlertDescription>{optimizeErrorMessage(optimize.error, t)}</AlertDescription>
        </Alert>
      )}
      {!ready && !running && (
        <p className="text-sm text-muted-foreground">
          {technicianIds.size === 0
            ? t('schedule.plan.optimize.needTechnician')
            : t('schedule.plan.optimize.needJob')}
        </p>
      )}
      {running && (
        <div role="status" className="flex items-center gap-2 text-sm">
          <Spinner aria-hidden="true" role="presentation" />
          <span>
            {t('schedule.plan.optimize.running')}{' '}
            <span className="text-muted-foreground">{t('schedule.plan.optimize.runningHint')}</span>
          </span>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={running} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="button" disabled={!ready || running} onClick={start}>
          {t('schedule.plan.optimize.start')}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** 402: the plan has no optimisation. 502: the solver failed. Anything else is the same retry. */
function optimizeErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 402) {
    return t('schedule.plan.optimize.notIncludedError')
  }
  return t('schedule.plan.optimize.failed')
}
