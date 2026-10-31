import type { DealConvertJob } from '@/shared/api/generated/model'
import type { FieldErrors } from '@/shared/api/api-error'
import { clientErrorPath, jobErrorPath, toFormErrors } from '@/features/job/quick-create'

interface JobForm {
  jobTypeId: string
  title: string
  description: string
  priority: DealConvertJob['priority']
  preferredDate: string
  windowStart: string
  windowEnd: string
  customFields: DealConvertJob['customFields']
}

const orNull = (value: string) => (value === '' ? null : value)

/**
 * `DealConvertJob`: what the request carries of the job. Source, duration, crew size and
 * the internal note are not part of a conversion, so they are not sent.
 */
export function toConvertJob(job: JobForm): DealConvertJob {
  return {
    jobTypeId: job.jobTypeId,
    title: job.title,
    description: orNull(job.description),
    priority: job.priority,
    preferredDate: orNull(job.preferredDate),
    windowStart: orNull(job.windowStart),
    windowEnd: orNull(job.windowEnd),
    customFields: job.customFields,
  }
}

/** Where an error of `POST /sales/deals/{id}/convert` belongs in the form. */
export function convertErrorPath(path: string, { isCompany }: { isCompany: boolean }): string {
  if (path === 'clientId') return 'client.clientId'
  if (path === 'locationId') return 'location.locationId'
  if (path.startsWith('newClient.'))
    return clientErrorPath(path.slice('newClient.'.length), { isCompany })
  if (path === 'newClient') return 'client.name'
  if (path.startsWith('job.')) return jobErrorPath(path.slice('job.'.length))
  return path
}

export function toConvertFormErrors(errors: FieldErrors, isCompany: boolean): FieldErrors {
  return toFormErrors(errors, (path) => convertErrorPath(path, { isCompany }))
}
