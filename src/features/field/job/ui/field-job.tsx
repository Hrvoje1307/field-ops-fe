import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, NavigationIcon } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'

import { AssetSummary } from '@/entities/asset'
import { CallButton } from '@/entities/client'
import {
  type Job,
  JobNumber,
  JobTypeTag,
  PriorityMark,
  StatusBadge,
  useGetJob,
} from '@/entities/job'
import { AccessCodes, AccessNotes, mapsUrl } from '@/entities/location'
import { ApiError } from '@/shared/api/api-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { CustomFieldValuesFor } from './custom-field-values-for'

/**
 * One job on the phone: where it is (navigation, access notes and codes masked until
 * tapped), who to call, what to do, the equipment and the job's own fields. The action
 * bar comes in as a slot; the page leaves room for it.
 */
export function FieldJob({ jobId, bottomBar }: { jobId: string; bottomBar?: ReactNode }) {
  const { t } = useTranslation()
  const job = useGetJob(jobId)

  if (job.isPending) {
    return (
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (job.isError) {
    // Someone else's job is a 404 for technicians
    if (job.error instanceof ApiError && job.error.status === 404) return <NotFound />
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('field.job.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void job.refetch()}>
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return (
    <>
      <Details job={job.data} />
      {bottomBar && <div className="h-24" aria-hidden="true" />}
      {bottomBar}
    </>
  )
}

function Details({ job }: { job: Job }) {
  const { t } = useTranslation()
  const { formatTime } = useTenantFormat()
  const contacts = [...(job.clientDetail?.contacts ?? [])]
    .filter((contact) => contact.phone)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const location = job.locationDetail
  const place = { address: job.location.address, lat: job.location.lat, lng: job.location.lng }

  return (
    <div className="space-y-4">
      <Link
        to="/field"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('field.job.back')}
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <JobNumber number={job.number} className="text-sm" />
          <StatusBadge status={job.status} />
          <PriorityMark priority={job.priority} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <JobTypeTag jobType={job.jobType} />
          {job.scheduledStart && <span>{formatTime(job.scheduledStart)}</span>}
        </div>
      </header>

      <Block title={t('field.job.where')}>
        <p className="text-base font-medium">{job.location.address}</p>
        <Button asChild size="lg" className="h-12 w-full gap-3">
          <a href={mapsUrl(place, { directions: true })} target="_blank" rel="noopener noreferrer">
            <NavigationIcon aria-hidden="true" />
            {t('field.job.navigate')}
          </a>
        </Button>
        {location && (
          <>
            <AccessNotes notes={location.accessNotes} className="text-base" />
            {(Boolean(location.accessCodes?.trim()) || location.hasAccessCodes === true) && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('location.accessCodes')}</p>
                <AccessCodes location={location} size="lg" />
              </div>
            )}
            <CustomFieldValuesFor scope={{ entity: 'location' }} values={location.customFields} />
          </>
        )}
      </Block>

      {contacts.length > 0 && (
        <Block title={t('field.job.contacts')}>
          <div className="space-y-2">
            {contacts.map((contact) => (
              <CallButton key={contact.id} contact={contact} />
            ))}
          </div>
        </Block>
      )}

      {(Boolean(job.description?.trim()) || Boolean(job.internalNote?.trim())) && (
        <Block title={t('field.job.description')}>
          {Boolean(job.description?.trim()) && (
            <p className="text-base whitespace-pre-line">{job.description}</p>
          )}
          {Boolean(job.internalNote?.trim()) && (
            <div className="space-y-1 rounded-lg bg-muted/50 p-3">
              <p className="text-sm font-medium">{t('field.job.note')}</p>
              <p className="whitespace-pre-line">{job.internalNote}</p>
            </div>
          )}
        </Block>
      )}

      {job.asset && (
        <Block title={t('field.job.asset')}>
          <AssetSummary asset={job.asset} className="text-base" />
          <CustomFieldValuesFor
            scope={{ entity: 'asset', assetTypeId: job.asset.assetTypeId }}
            values={job.asset.customFields}
          />
        </Block>
      )}

      <CustomFieldValuesFor
        scope={{ entity: 'job' }}
        values={job.customFields}
        title={t('job.detail.customFields')}
        className="space-y-3 rounded-xl border p-4"
      />
    </div>
  )
}

function Block({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="space-y-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('field.job.notFound')}</h1>
      <p className="text-muted-foreground">{t('field.job.notFoundDescription')}</p>
      <Button asChild variant="outline" size="lg" className="h-12">
        <Link to="/field">{t('field.job.back')}</Link>
      </Button>
    </div>
  )
}
