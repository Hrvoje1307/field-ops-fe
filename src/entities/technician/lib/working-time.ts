import type { Technician } from '@/shared/api/generated/model'

/** ISO weekday (1 = Monday … 7 = Sunday) of a plain date; no time zone involved. */
export function isoWeekday(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function worksOn(technician: Pick<Technician, 'workingDays'>, date: string): boolean {
  return technician.workingDays.includes(isoWeekday(date))
}

/** `HH:mm` plus minutes, as minutes since midnight. */
export function minutesOf(time: string, plus = 0): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes + plus
}

/** Whether a job from `start` for `durationMin` fits in the technician's working hours. */
export function withinHours(
  technician: Pick<Technician, 'workStart' | 'workEnd'>,
  start: string,
  durationMin: number,
): boolean {
  return (
    minutesOf(start) >= minutesOf(technician.workStart) &&
    minutesOf(start, durationMin) <= minutesOf(technician.workEnd)
  )
}

/** The skills a job type requires that the technician doesn't have (ids). */
export function missingSkillIds(
  technician: Pick<Technician, 'skillIds'>,
  requiredSkillIds: readonly string[],
): string[] {
  return requiredSkillIds.filter((id) => !technician.skillIds.includes(id))
}
