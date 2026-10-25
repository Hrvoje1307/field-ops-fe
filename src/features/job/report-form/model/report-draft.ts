import type { JobReport, JobReportInput } from '@/entities/report'
import { dateInTimeZone, timeInTimeZone, zonedDateTimeToInstant } from '@/shared/lib/datetime'

/** What the technician types, as text. Times are tenant-local `HH:mm`. */
export interface ReportDraft {
  workDone: string
  started: string
  finished: string
  /** Minutes. */
  labour: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MINUTES = /^\d{1,5}$/

export const isTime = (value: string) => TIME.test(value)

/** The last time the job went on site (the arrival), from its status history. */
export function arrivalInstant(
  history: readonly { toStatus: string; changedAt: string }[],
): string | null {
  const arrivals = history.filter((entry) => entry.toStatus === 'on_site')
  return arrivals.at(-1)?.changedAt ?? null
}

/**
 * Starting values from the saved report. Without a saved start the arrival from the
 * history is offered, so the technician only has to confirm it.
 */
export function draftFromReport(
  report: Pick<JobReport, 'workDone' | 'startedAt' | 'finishedAt' | 'labourMinutes'>,
  { timeZone, arrival }: { timeZone: string; arrival: string | null },
): ReportDraft {
  const started = report.startedAt ?? arrival
  return {
    workDone: report.workDone ?? '',
    started: started ? timeInTimeZone(started, timeZone) : '',
    finished: report.finishedAt ? timeInTimeZone(report.finishedAt, timeZone) : '',
    labour:
      report.labourMinutes === null || report.labourMinutes === undefined
        ? ''
        : String(report.labourMinutes),
  }
}

export interface DraftErrors {
  started?: 'invalid'
  finished?: 'invalid' | 'order'
  labour?: 'invalid'
}

export function draftErrors(draft: ReportDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (draft.started !== '' && !isTime(draft.started)) errors.started = 'invalid'
  if (draft.finished !== '' && !isTime(draft.finished)) errors.finished = 'invalid'
  else if (isTime(draft.started) && isTime(draft.finished) && draft.finished < draft.started) {
    errors.finished = 'order'
  }
  if (draft.labour !== '' && !MINUTES.test(draft.labour)) errors.labour = 'invalid'
  return errors
}

/**
 * The draft as the API's input. A field with a typing mistake (half a time, a letter in
 * the minutes) keeps what the report already has, so the rest still saves while it is
 * being corrected. The day of a time is the day of the saved one, else `day`.
 */
export function draftToInput(
  draft: ReportDraft,
  saved: Pick<JobReport, 'startedAt' | 'finishedAt' | 'labourMinutes'>,
  { day, timeZone }: { day: string; timeZone: string },
): JobReportInput {
  const errors = draftErrors(draft)
  const instant = (time: string, current: string | null | undefined) => {
    if (time === '') return null
    const date = current ? dateInTimeZone(current, timeZone) : day
    return zonedDateTimeToInstant(date, time, timeZone)
  }
  return {
    workDone: draft.workDone === '' ? null : draft.workDone,
    startedAt: errors.started ? (saved.startedAt ?? null) : instant(draft.started, saved.startedAt),
    finishedAt: errors.finished
      ? (saved.finishedAt ?? null)
      : instant(draft.finished, saved.finishedAt),
    labourMinutes: errors.labour
      ? (saved.labourMinutes ?? null)
      : draft.labour === ''
        ? null
        : Number(draft.labour),
  }
}

/** What an already saved report amounts to as input (the autosave's starting point). */
export function inputOf(
  report: Pick<JobReport, 'workDone' | 'startedAt' | 'finishedAt' | 'labourMinutes'>,
): JobReportInput {
  return {
    workDone: report.workDone ?? null,
    startedAt: report.startedAt ?? null,
    finishedAt: report.finishedAt ?? null,
    labourMinutes: report.labourMinutes ?? null,
  }
}
