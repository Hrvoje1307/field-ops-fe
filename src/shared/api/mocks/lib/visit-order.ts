import type { JobRow, TenantData } from '../db/rows'

/** ISO weekday (1 = Monday … 7 = Sunday) of a plain date. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

/** A technician's jobs on a day in visit order: position, then start, then number. */
export function visitOrder(t: TenantData, technicianId: string, date: string): JobRow[] {
  const sequenceOf = (job: JobRow) =>
    t.assignments.find((a) => a.jobId === job.id && a.isLead)?.sequence ?? Number.MAX_SAFE_INTEGER
  return t.jobs
    .filter(
      (job) =>
        !job.deletedAt &&
        job.status !== 'cancelled' &&
        job.scheduledDate === date &&
        t.assignments.some((a) => a.jobId === job.id && a.technicianId === technicianId),
    )
    .sort(
      (a, b) =>
        sequenceOf(a) - sequenceOf(b) ||
        (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? '') ||
        a.number.localeCompare(b.number),
    )
}

/**
 * Puts a job at a position in its lead technician's day and numbers the day again, so
 * the others make room (the contract only says "position in the lead technician's day";
 * docs/backend-questions.md #31 asks what the API does).
 */
export function placeInDay(
  t: TenantData,
  job: JobRow,
  leadId: string,
  date: string,
  position: number,
): void {
  const others = visitOrder(t, leadId, date).filter((other) => other.id !== job.id)
  others.splice(Math.max(0, Math.min(position, others.length)), 0, job)
  others.forEach((other, index) => {
    const lead = t.assignments.find((a) => a.jobId === other.id && a.isLead)
    if (lead?.technicianId === leadId) lead.sequence = index
  })
}
