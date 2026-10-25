import { z } from 'zod'

import type { AssignRequest, Job } from '@/entities/job'
import { isPlainDate, timeInTimeZone, zonedDateTimeToInstant } from '@/shared/lib/datetime'
import { i18n } from '@/shared/i18n'

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface AssignFormValues {
  /** Tenant-local `yyyy-MM-dd`. */
  date: string
  /** Tenant-local `HH:mm`, or empty for the day only. */
  time: string
  technicianIds: string[]
  leadId: string
}

export function buildAssignSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    date: z.string().refine(isPlainDate, t('schedule.assign.errors.dateRequired')),
    time: z
      .string()
      .refine((value) => value === '' || TIME.test(value), t('schedule.assign.errors.timeInvalid')),
    technicianIds: z.array(z.string()).min(1, t('schedule.assign.errors.technicianRequired')),
    leadId: z.string(),
  })
}

/**
 * Starting values: the job's own schedule, else the day being looked at, else the
 * client's preferred date, else today; the time from the schedule or the window.
 */
export function assignFormValues(
  job: Pick<
    Job,
    'scheduledDate' | 'scheduledStart' | 'preferredDate' | 'windowStart' | 'technicians'
  >,
  { day, today, timeZone }: { day?: string; today: string; timeZone: string },
): AssignFormValues {
  const lead = job.technicians.find((technician) => technician.isLead) ?? job.technicians[0]
  return {
    date: job.scheduledDate ?? day ?? job.preferredDate ?? today,
    time: job.scheduledStart
      ? timeInTimeZone(job.scheduledStart, timeZone)
      : (job.windowStart ?? ''),
    technicianIds: job.technicians.map((technician) => technician.id),
    leadId: lead?.id ?? '',
  }
}

/**
 * `AssignRequest`: the start is the tenant-local date and time as a UTC instant; the
 * lead is the chosen one if still selected, else the first.
 */
export function toAssignRequest(
  values: AssignFormValues,
  { timeZone, version }: { timeZone: string; version: number },
): AssignRequest {
  const lead = values.technicianIds.includes(values.leadId)
    ? values.leadId
    : (values.technicianIds[0] ?? null)
  return {
    technicianIds: values.technicianIds,
    leadTechnicianId: lead,
    scheduledDate: values.date,
    scheduledStart: values.time ? zonedDateTimeToInstant(values.date, values.time, timeZone) : null,
    version,
  }
}
