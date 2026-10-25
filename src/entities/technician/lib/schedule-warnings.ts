import type { Technician } from '@/shared/api/generated/model'
import { timeInTimeZone } from '@/shared/lib/datetime'

import { minutesOf, missingSkillIds, withinHours, worksOn } from './working-time'

/** Things the dispatcher should know before saving; none of them blocks. */
export type ScheduleWarning =
  | { kind: 'missingSkills'; name: string; skills: string[] }
  | { kind: 'dayOff'; name: string }
  | { kind: 'outsideHours'; name: string; start: string; end: string }
  | { kind: 'crew'; required: number; selected: number }
  | { kind: 'overlap'; name: string; number: string }

/** The part of a board column the overlap check reads (a `DispatchBoard` column fits). */
export interface WarningColumn {
  technician: { id: string }
  jobs: readonly {
    id: string
    number: string
    durationMin: number
    scheduledStart?: string | null
  }[]
}

export interface WarningInput {
  job: { id: string; durationMin: number; requiredPeople: number }
  /** The job type's required skills (ids). */
  requiredSkillIds: readonly string[]
  /** The chosen technicians. */
  technicians: readonly Technician[]
  /** Every technician, for skill names. */
  allTechnicians: readonly Technician[]
  date: string
  /** `HH:mm`, or empty for the day only. */
  time: string
  /** The board for `date` (other jobs of the chosen technicians). */
  columns: readonly WarningColumn[]
  timeZone: string
}

/**
 * Skills, working days and hours come from the technicians (tenant data), the
 * required skills from the job type: nothing here is specific to a trade.
 */
export function scheduleWarnings(input: WarningInput): ScheduleWarning[] {
  const { job, technicians, date, time } = input
  const skillName = new Map(
    input.allTechnicians.flatMap((technician) =>
      technician.skills.map((skill) => [skill.id, skill.name] as const),
    ),
  )
  const warnings: ScheduleWarning[] = []

  for (const technician of technicians) {
    const missing = missingSkillIds(technician, input.requiredSkillIds)
    if (missing.length > 0) {
      warnings.push({
        kind: 'missingSkills',
        name: technician.fullName,
        skills: missing.map((id) => skillName.get(id) ?? id),
      })
    }
    if (!worksOn(technician, date)) {
      warnings.push({ kind: 'dayOff', name: technician.fullName })
    } else if (time && !withinHours(technician, time, job.durationMin)) {
      warnings.push({
        kind: 'outsideHours',
        name: technician.fullName,
        start: technician.workStart,
        end: technician.workEnd,
      })
    }
    if (time) {
      const start = minutesOf(time)
      const end = start + job.durationMin
      const column = input.columns.find((c) => c.technician.id === technician.id)
      for (const other of column?.jobs ?? []) {
        if (other.id === job.id || !other.scheduledStart) continue
        const otherStart = minutesOf(timeInTimeZone(other.scheduledStart, input.timeZone))
        if (start < otherStart + other.durationMin && otherStart < end) {
          warnings.push({ kind: 'overlap', name: technician.fullName, number: other.number })
        }
      }
    }
  }

  if (technicians.length > 0 && technicians.length < job.requiredPeople) {
    warnings.push({ kind: 'crew', required: job.requiredPeople, selected: technicians.length })
  }
  return warnings
}
