import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useGetJob } from '@/entities/job'
import { ReportForm } from '@/features/job/report-form'
import { ReportView } from '@/features/job/report-view'
import { ApiError } from '@/shared/api/api-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/**
 * The technician's report: a form while they are on site; once the job has moved on
 * (completed, put on hold) what has been written, read-only.
 */
export function FieldReportView({
  jobId,
  onCompleted,
}: {
  jobId: string
  onCompleted: () => void
}) {
  const { t } = useTranslation()
  const job = useGetJob(jobId)

  if (job.isPending) {
    return (
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (job.isError) {
    const missing = job.error instanceof ApiError && job.error.status === 404
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {missing ? t('field.job.notFound') : t('field.job.loadFailed')}
        </AlertDescription>
        {!missing && (
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void job.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    )
  }
  if (job.data.status === 'on_site') return <ReportForm jobId={jobId} onCompleted={onCompleted} />
  return (
    <div className="space-y-4">
      <Link
        to="/field/jobs/$jobId"
        params={{ jobId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
        {t('report.back')}
      </Link>
      {job.data.status !== 'completed' && job.data.status !== 'invoiced' && (
        <Alert>
          <AlertDescription>{t('report.notOnSite')}</AlertDescription>
        </Alert>
      )}
      <ReportView jobId={jobId} />
    </div>
  )
}
