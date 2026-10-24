import { Link } from '@tanstack/react-router'
import { CalendarClockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { JobNumber, type JobSummary, JobTypeTag, PriorityMark, StatusBadge } from '@/entities/job'
import { TechnicianChips } from '@/entities/technician'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

/** Job rows: a table on wider screens, cards on phones. Each row opens the job. */
export function JobsTable({ jobs }: { jobs: JobSummary[] }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('job.list.columns.number')}</TableHead>
              <TableHead>{t('job.list.columns.job')}</TableHead>
              <TableHead>{t('job.list.columns.client')}</TableHead>
              <TableHead>{t('job.list.columns.schedule')}</TableHead>
              <TableHead>{t('job.list.columns.technicians')}</TableHead>
              <TableHead>{t('job.list.columns.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              // The title link covers the row, so the whole row opens the job
              <TableRow key={job.id} className="relative" data-testid="job-row">
                <TableCell className="align-top">
                  <JobNumber number={job.number} />
                </TableCell>
                <TableCell className="max-w-72 align-top whitespace-normal">
                  <div className="flex items-start gap-1.5">
                    <JobLink job={job} />
                    <PriorityMark priority={job.priority} iconOnly className="mt-0.5" />
                  </div>
                  <JobTypeTag jobType={job.jobType} className="text-xs text-muted-foreground" />
                </TableCell>
                <TableCell className="max-w-64 align-top whitespace-normal">
                  <div>{job.client.name}</div>
                  <div className="text-xs text-muted-foreground">{job.location.address}</div>
                </TableCell>
                <TableCell className="align-top">
                  <Schedule job={job} />
                </TableCell>
                <TableCell className="align-top">
                  <Technicians job={job} />
                </TableCell>
                <TableCell className="align-top">
                  <StatusBadge status={job.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="space-y-2 md:hidden">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="relative space-y-1.5 rounded-lg border p-3"
            data-testid="job-card"
          >
            <div className="flex items-center justify-between gap-2">
              <JobNumber number={job.number} />
              <StatusBadge status={job.status} />
            </div>
            <div className="flex items-start gap-1.5">
              <JobLink job={job} />
              <PriorityMark priority={job.priority} iconOnly className="mt-0.5" />
            </div>
            <p className="text-sm">
              {job.client.name}
              <span className="block text-xs text-muted-foreground">{job.location.address}</span>
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <Schedule job={job} />
              <Technicians job={job} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function JobLink({ job }: { job: JobSummary }) {
  return (
    <Link
      to="/jobs/$jobId"
      params={{ jobId: job.id }}
      className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
    >
      {job.title}
    </Link>
  )
}

function Schedule({ job }: { job: JobSummary }) {
  const { t } = useTranslation()
  const { formatRelativeDay, formatTime } = useTenantFormat()
  const window = job.windowStart && job.windowEnd ? `${job.windowStart}–${job.windowEnd}` : null

  return (
    <div className="text-sm">
      {job.scheduledDate ? (
        <span>
          {formatRelativeDay(job.scheduledDate)}
          {job.scheduledStart && (
            <span className="text-muted-foreground"> {formatTime(job.scheduledStart)}</span>
          )}
        </span>
      ) : job.preferredDate ? (
        <span className="text-muted-foreground">
          {t('job.list.preferred', { day: formatRelativeDay(job.preferredDate) })}
        </span>
      ) : (
        <span className="text-muted-foreground">{t('job.list.unscheduled')}</span>
      )}
      {window && <span className="block text-xs text-muted-foreground">{window}</span>}
      {job.rescheduleRequested && (
        <span className="flex items-center gap-1 text-xs text-amber-800">
          <CalendarClockIcon aria-hidden="true" className="size-3.5" />
          {t('job.list.rescheduleRequested')}
        </span>
      )}
    </div>
  )
}

function Technicians({ job }: { job: JobSummary }) {
  const { t } = useTranslation()
  if (job.technicians.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('job.list.unassigned')}</span>
  }
  return <TechnicianChips technicians={job.technicians} compact />
}
