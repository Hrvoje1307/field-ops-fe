import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { JOB_LIST_STALE_TIME, jobKeys, JobNumber, listJobs, StatusBadge } from '@/entities/job'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const SHOWN = 10

/** A client's latest jobs, newest first. */
export function ClientJobs({ clientId }: { clientId: string }) {
  const { t } = useTranslation()
  const { formatRelativeDay } = useTenantFormat()
  const params = { clientId, sort: '-createdAt' as const, page: 1, pageSize: SHOWN }
  const jobs = useQuery({
    queryKey: jobKeys.list(params),
    queryFn: async ({ signal }) => {
      return listJobs(params, signal)
    },
    staleTime: JOB_LIST_STALE_TIME,
  })

  if (jobs.isPending) return <Skeleton className="h-24" />
  if (jobs.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('job.list.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void jobs.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (jobs.data.items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('client.detail.noJobs')}</p>
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y" data-testid="client-jobs">
        {jobs.data.items.map((job) => (
          <li key={job.id} className="space-y-1 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <JobNumber number={job.number} />
              <StatusBadge status={job.status} />
            </div>
            <Link
              to="/jobs/$jobId"
              params={{ jobId: job.id }}
              className="block font-medium underline-offset-4 hover:underline"
            >
              {job.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {[
                job.scheduledDate ? formatRelativeDay(job.scheduledDate) : null,
                job.location.address,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      {jobs.data.totalCount > jobs.data.items.length && (
        <p className="text-xs text-muted-foreground">
          {t('client.detail.jobsShown', {
            shown: jobs.data.items.length,
            total: jobs.data.totalCount,
          })}
        </p>
      )}
    </div>
  )
}
