const unitFormatters = new Map<string, Intl.NumberFormat>()

function unit(locale: string, name: 'hour' | 'minute', value: number): string {
  const cacheKey = `${locale}|${name}`
  let formatter = unitFormatters.get(cacheKey)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'short' })
    unitFormatters.set(cacheKey, formatter)
  }
  return formatter.format(value)
}

/** Minutes as a short duration in the locale: `45 min`, `1 h 30 min`, `2 h` (hr-HR). */
export function formatDuration(minutes: number, locale: string): string {
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return unit(locale, 'minute', rest)
  if (rest === 0) return unit(locale, 'hour', hours)
  return `${unit(locale, 'hour', hours)} ${unit(locale, 'minute', rest)}`
}
