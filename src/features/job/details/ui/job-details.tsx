import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  getJob,
  getJobHistory,
  JOB_DETAIL_STALE_TIME,
  JOB_HISTORY_STALE_TIME,
  type Job,
  jobKeys,
  JobNumber,
  JobTypeTag,
  PriorityMark,
  StatusBadge,
  StatusTrack,
} from '@/entities/job'
import { ApiError } from '@/shared/api/api-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { AssetSection } from './asset-section'
import { ClientSection } from './client-section'
import { CustomFieldValuesFor } from './custom-field-values-for'
import { JobNotFound } from './job-not-found'
import { LocationSection } from './location-section'
import { ScheduleSection } from './schedule-section'
import { Section } from './section'

interface Slots {
  /** Next to the title, e.g. the status menu. */
  actions?: ReactNode
  /** The status history, under the job's fields. */
  history?: ReactNode
}

/**
 * One job for the office: status track, schedule, client, location (with access
 * codes), equipment and the job's own fields. Actions and history come in as slots.
 */
export function JobDetails({ jobId, actions, history }: { jobId: string } & Slots) {
  const { t } = useTranslation()
  const job = useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: async ({ signal }) => {
      return getJob(jobId, signal)
    },
    staleTime: JOB_DETAIL_STALE_TIME,
  })

  if (job.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (job.isError) {
    if (job.error instanceof ApiError && job.error.status === 404) return <JobNotFound />
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('job.detail.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void job.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <JobDetail job={job.data} actions={actions} history={history} />
}

function JobDetail({ job, actions, history }: { job: Job } & Slots) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  // The track shows when each step was reached
  const statusHistory = useQuery({
    queryKey: jobKeys.history(job.id),
    queryFn: async ({ signal }) => {
      return getJobHistory(job.id, signal)
    },
    staleTime: JOB_HISTORY_STALE_TIME,
  })
  const reason =
    job.status === 'on_hold'
      ? job.onHoldReason
      : job.status === 'cancelled'
        ? job.cancelReason
        : null

  return (
    <div className="space-y-6">
      <Link
        to="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('job.detail.back')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <JobNumber number={job.number} className="text-sm" />
            <StatusBadge status={job.status} />
            <PriorityMark priority={job.priority} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <JobTypeTag jobType={job.jobType} />
            <span>{t('job.detail.created', { when: formatRelativeDateTime(job.createdAt) })}</span>
          </div>
        </div>
        {actions}
      </header>

      <div className="rounded-xl border p-4">
        <StatusTrack status={job.status} history={statusHistory.data} reason={reason} />
      </div>

      {job.rescheduleRequested && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">{t('job.detail.rescheduleRequested')}</p>
            {job.rescheduleNote && <p className="whitespace-pre-line">{job.rescheduleNote}</p>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <div className="min-w-0 space-y-6">
          <Section title={t('job.detail.description')}>
            {job.description?.trim() ? (
              <p className="text-sm whitespace-pre-line">{job.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('job.detail.noDescription')}</p>
            )}
            {job.internalNote?.trim() && (
              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">{t('job.detail.internalNote')}</p>
                <p className="whitespace-pre-line">{job.internalNote}</p>
              </div>
            )}
          </Section>
          <CustomFieldValuesFor
            scope={{ entity: 'job' }}
            values={job.customFields}
            title={t('job.detail.customFields')}
            className="space-y-3 rounded-xl border p-4"
          />
          {history && <Section title={t('job.history.title')}>{history}</Section>}
        </div>
        <div className="min-w-0 space-y-6">
          <ScheduleSection job={job} />
          <ClientSection job={job} />
          <LocationSection job={job} />
          {job.asset && <AssetSection asset={job.asset} />}
        </div>
      </div>
    </div>
  )
}
