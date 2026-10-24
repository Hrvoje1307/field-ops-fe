import { cn } from 'cn'
import { CheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { JobStatus, StatusHistoryEntry } from '@/shared/api/generated/model'
import { useTenantFormat } from '@/shared/lib/tenant-format'

import { type TrackStepState, trackSteps } from '../model/status-track'
import { StatusBadge } from './status-badge'

const MARKER_CLASS: Record<TrackStepState, string> = {
  done: 'border-primary bg-primary text-primary-foreground',
  current: 'border-primary bg-background ring-4 ring-primary/20',
  skipped: 'border-dashed border-muted-foreground/50 bg-background',
  upcoming: 'border-muted-foreground/30 bg-background',
}

/**
 * Where the job is on its usual path, with the time each step was reached. On hold and
 * cancelled are shown off the track, with the reason. Display only: status changes come
 * from `allowedTransitions` (see features/job/change-status).
 */
export function StatusTrack({
  status,
  history,
  reason,
  className,
}: {
  status: JobStatus
  /** `GET /jobs/{id}/history`; undefined while loading. */
  history?: StatusHistoryEntry[]
  /** `onHoldReason` / `cancelReason` of the job. */
  reason?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const { steps, offTrack } = trackSteps(status, history)

  return (
    <div className={cn('space-y-3', className)}>
      <ol
        aria-label={t('job.track.label')}
        className={cn(
          'grid gap-x-2 gap-y-3 sm:grid-cols-4 lg:grid-cols-7',
          offTrack?.status === 'cancelled' && 'opacity-60',
        )}
      >
        {steps.map((step) => (
          <li
            key={step.status}
            data-state={step.state}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className="flex items-start gap-2 lg:flex-col"
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                MARKER_CLASS[step.state],
              )}
            >
              {step.state === 'done' && <CheckIcon className="size-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 text-sm leading-tight">
              <span
                className={cn(
                  'block',
                  step.state === 'current' && 'font-semibold',
                  (step.state === 'upcoming' || step.state === 'skipped') &&
                    'text-muted-foreground',
                )}
              >
                {t(`job.status.${step.status}`)}
              </span>
              {step.state === 'skipped' && (
                <span className="block text-xs text-muted-foreground">
                  {t('job.track.skipped')}
                </span>
              )}
              {step.at && (step.state === 'done' || step.state === 'current') && (
                <time dateTime={step.at} className="block text-xs text-muted-foreground">
                  {formatRelativeDateTime(step.at)}
                </time>
              )}
            </span>
          </li>
        ))}
      </ol>

      {offTrack && (
        <div
          data-testid="off-track"
          className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={offTrack.status} />
            {offTrack.at && (
              <time dateTime={offTrack.at} className="text-xs text-muted-foreground">
                {formatRelativeDateTime(offTrack.at)}
              </time>
            )}
          </div>
          {reason && (
            <p>
              <span className="font-medium">{t(`job.reason.${offTrack.status}`)}: </span>
              <span className="whitespace-pre-line">{reason}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
