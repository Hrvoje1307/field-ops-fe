/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

// 1 January 2024 was a Monday
const MONDAY = Date.UTC(2024, 0, 1)

/** The name of an ISO weekday in `locale` (`pon`, `ponedjeljak`). */
export function weekdayName(
  isoDay: number,
  locale: string,
  style: 'short' | 'long' = 'short',
): string {
  const date = new Date(MONDAY + (isoDay - 1) * 86_400_000)
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(date)
}

/**
 * Working days in a few words: runs of days as a range (`pon–pet`), the others listed
 * (`pon, sri, pet`); `everyDay` and `noDays` for the two ends.
 */
export function formatWeekdays(
  days: readonly number[],
  locale: string,
  words: { everyDay: string; noDays: string },
): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b)
  if (sorted.length === 0) return words.noDays
  if (sorted.length === 7) return words.everyDay
  const runs: number[][] = []
  for (const day of sorted) {
    const run = runs.at(-1)
    if (run?.at(-1) === day - 1) run.push(day)
    else runs.push([day])
  }
  return runs
    .map((run) => {
      const first = run[0]
      const last = run[run.length - 1]
      if (first === undefined || last === undefined) return ''
      if (run.length >= 3) return `${weekdayName(first, locale)}–${weekdayName(last, locale)}`
      return run.map((day) => weekdayName(day, locale)).join(', ')
    })
    .join(', ')
}
