/**
 * Tenant-aware date/time helpers.
 *
 * Instants are UTC ISO strings. Plain dates (`yyyy-MM-dd`) and wall-clock times
 * (`HH:mm`) are tenant-local. Always pass the tenant's time zone (from `/tenant`),
 * never rely on the browser's.
 */

export interface TenantClock {
  timeZone: string
  locale: string
}

const DAY_MS = 86_400_000

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, formatter)
  }
  return formatter
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallClock(instantMs: number, timeZone: string): WallClock {
  const parts = partsFormatter(timeZone).formatToParts(instantMs)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** UTC offset of `timeZone` at the given instant, in ms (e.g. +2 h for Zagreb in summer). */
function offsetMs(instantMs: number, timeZone: string): number {
  const w = wallClock(instantMs, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

const pad = (n: number, length = 2) => String(n).padStart(length, '0')

function toInstantMs(instant: string | number | Date): number {
  return typeof instant === 'number' ? instant : new Date(instant).getTime()
}

/** ISO instant without milliseconds, e.g. `2026-10-16T08:00:00Z`. */
export function toIsoInstant(instant: string | number | Date): string {
  return new Date(toInstantMs(instant)).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function parsePlainDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new RangeError(`Invalid plain date: ${date}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function parseTimeOfDay(time: string): [number, number] {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time)
  if (!match) throw new RangeError(`Invalid time of day: ${time}`)
  return [Number(match[1]), Number(match[2])]
}

/** Tenant-local calendar date of an instant, `yyyy-MM-dd`. */
export function dateInTimeZone(instant: string | number | Date, timeZone: string): string {
  const w = wallClock(toInstantMs(instant), timeZone)
  return `${String(w.year)}-${pad(w.month)}-${pad(w.day)}`
}

/** Tenant-local wall-clock time of an instant, `HH:mm`. */
export function timeInTimeZone(instant: string | number | Date, timeZone: string): string {
  const w = wallClock(toInstantMs(instant), timeZone)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/** Today's date in the tenant's time zone. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return dateInTimeZone(now, timeZone)
}

/** Calendar arithmetic on a plain date (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parsePlainDate(date)
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
  return shifted.toISOString().slice(0, 10)
}

/**
 * The UTC instant of a tenant-local date + wall-clock time.
 * Follows Temporal's "compatible" disambiguation: a time skipped by a DST gap
 * moves forward by the gap; a repeated time (DST overlap) takes the earlier instant.
 */
export function zonedDateTimeToInstant(date: string, time: string, timeZone: string): string {
  const [year, month, day] = parsePlainDate(date)
  const [hour, minute] = parseTimeOfDay(time)
  const localMs = Date.UTC(year, month - 1, day, hour, minute)

  const offsetBefore = offsetMs(localMs - DAY_MS, timeZone)
  const offsetAfter = offsetMs(localMs + DAY_MS, timeZone)
  const valid = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => localMs - offset)
    .filter((instantMs) => offsetMs(instantMs, timeZone) === localMs - instantMs)

  const instantMs = valid.length > 0 ? Math.min(...valid) : localMs - offsetBefore
  return toIsoInstant(instantMs)
}

/** Localised plain date (e.g. `19. 10. 2026.` for hr-HR); never shifted by a time zone. */
export function formatDate(
  date: string,
  { locale }: Pick<TenantClock, 'locale'>,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const [year, month, day] = parsePlainDate(date)
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(
    Date.UTC(year, month - 1, day),
  )
}

/** Localised 24-hour time of an instant in the tenant's time zone, e.g. `08:30`. */
export function formatTime(instant: string, { locale, timeZone }: TenantClock): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(toInstantMs(instant))
}

/** Localised date and time of an instant in the tenant's time zone. */
export function formatDateTime(
  instant: string,
  { locale, timeZone }: TenantClock,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(toInstantMs(instant))
}
