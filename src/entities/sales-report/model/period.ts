import { addDays, isPlainDate } from '@/shared/lib/datetime'

export const REPORT_PRESETS = ['thisMonth', 'lastMonth', 'last90'] as const
export type ReportPreset = (typeof REPORT_PRESETS)[number]

export interface ReportPeriod {
  from: string
  to: string
}

const firstOfMonth = (date: string) => `${date.slice(0, 8)}01`

/**
 * A ready-made period as tenant-local dates, from `today` in the tenant's zone: this month
 * so far, the whole of last month, or the last 90 days including today.
 */
export function presetPeriod(preset: ReportPreset, today: string): ReportPeriod {
  switch (preset) {
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today }
    case 'lastMonth': {
      const lastDay = addDays(firstOfMonth(today), -1)
      return { from: firstOfMonth(lastDay), to: lastDay }
    }
    case 'last90':
      return { from: addDays(today, -89), to: today }
  }
}

/** The preset a period equals, if it is one. */
export function matchPreset(period: ReportPeriod, today: string): ReportPreset | undefined {
  return REPORT_PRESETS.find((preset) => {
    const candidate = presetPeriod(preset, today)
    return candidate.from === period.from && candidate.to === period.to
  })
}

/** The period of the address (`from`/`to`), this month when it is missing or not a valid range. */
export function periodFromSearch(
  search: { from?: string; to?: string },
  today: string,
): ReportPeriod {
  if (
    search.from &&
    search.to &&
    isPlainDate(search.from) &&
    isPlainDate(search.to) &&
    search.from <= search.to
  ) {
    return { from: search.from, to: search.to }
  }
  return presetPeriod('thisMonth', today)
}

/** A manual period is sendable when both dates are dates and `from` is not after `to`. */
export function isValidPeriod(period: { from: string; to: string }): boolean {
  return isPlainDate(period.from) && isPlainDate(period.to) && period.from <= period.to
}
