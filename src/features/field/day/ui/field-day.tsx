import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, NavigationIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CallButton } from '@/entities/client'
import {
  getMyDay,
  type Job,
  jobKeys,
  JobNumber,
  JobTypeTag,
  PriorityMark,
  StatusBadge,
} from '@/entities/job'
import { mapsUrl } from '@/entities/location'
import { addDays } from '@/shared/lib/datetime'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/** Jobs change as the day goes on and offices reschedule: refetched every time. */
const MY_DAY_STALE_TIME = 0

/**
 * The technician's day on the phone: date arrows, then the jobs in visit order as large
 * cards with the client's phone and navigation one tap away.
 */
export function FieldDay({
  date,
  onDateChange,
}: {
  /** Tenant-local `yyyy-MM-dd`. */
  date: string
  onDateChange: (date: string) => void
}) {
  const { t } = useTranslation()
  const { formatRelativeDay, today } = useTenantFormat()
  const day = useQuery({
    queryKey: jobKeys.myDay(date),
    queryFn: async ({ signal }) => {
      return getMyDay(date, signal)
    },
    staleTime: MY_DAY_STALE_TIME,
  })
  const isToday = date === today()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={t('field.day.previousDay')}
          onClick={() => {
            onDateChange(addDays(date, -1))
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <div className="min-w-0 text-center">
          <h1 className="text-xl font-semibold">{formatRelativeDay(date)}</h1>
          {day.data && (
            <p className="text-sm text-muted-foreground">
              {t('field.day.count', { count: day.data.jobs.length })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={t('field.day.nextDay')}
          onClick={() => {
            onDateChange(addDays(date, 1))
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
      {!isToday && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            onDateChange(today())
          }}
        >
          {t('field.day.today')}
        </Button>
      )}

      {day.isPending ? (
        <div aria-busy="true" className="space-y-3">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : day.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('field.day.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void day.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : day.data.jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {isToday ? t('field.day.emptyToday') : t('field.day.empty')}
        </p>
      ) : (
        <ul className="space-y-3" data-testid="field-jobs">
          {day.data.jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </ul>
      )}
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const { t } = useTranslation()
  const { formatTime } = useTenantFormat()
  const contact =
    job.clientDetail?.contacts.find((c) => c.isPrimary && c.phone) ??
    job.clientDetail?.contacts.find((c) => c.phone)
  const eta = job.routeStop?.eta
  const time = job.scheduledStart
    ? formatTime(job.scheduledStart)
    : eta
      ? t('field.day.arrival', { time: formatTime(eta) })
      : null

  return (
    <li className="relative space-y-3 rounded-xl border p-4" data-testid="field-job">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums">{time ?? t('field.day.noTime')}</span>
        <StatusBadge status={job.status} />
      </div>
      <div className="space-y-1">
        <div className="flex items-start gap-1.5">
          {/* The title link covers the card; the buttons below stay on top */}
          <Link
            to="/field/jobs/$jobId"
            params={{ jobId: job.id }}
            className="text-base font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {job.title}
          </Link>
          <PriorityMark priority={job.priority} iconOnly className="mt-1" />
        </div>
        <p className="text-sm text-muted-foreground">
          <JobNumber number={job.number} /> · {job.client.name}
        </p>
        <p className="text-sm">{job.location.address}</p>
        <JobTypeTag jobType={job.jobType} className="text-muted-foreground" />
      </div>
      <div className="relative z-10 grid gap-2 sm:grid-cols-2">
        {contact && <CallButton contact={contact} />}
        <Button asChild variant="outline" size="lg" className="h-12 justify-start gap-3">
          <a
            href={mapsUrl(
              { address: job.location.address, lat: job.location.lat, lng: job.location.lng },
              { directions: true },
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <NavigationIcon aria-hidden="true" />
            {t('field.day.navigate')}
          </a>
        </Button>
      </div>
    </li>
  )
}
