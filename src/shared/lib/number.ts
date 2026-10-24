/** Localised number, e.g. `1.234,5` for hr-HR. Not for money (see `formatMoney`). */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 10 }).format(value)
}

/** The locale's decimal separator (`,` for hr-HR, `.` for en-US). */
export function decimalSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? '.'
  )
}

/** A number as typed into an input: no grouping, the locale's decimal separator. */
export function numberToInput(value: number, locale: string): string {
  return String(value).replace('.', decimalSeparator(locale))
}

/**
 * A number typed by the user: `6,1` and `6.1` both mean 6.1; spaces (also no-break) are ignored.
 * Grouping separators are not accepted (`1.234,5` is ambiguous), nor is anything else.
 * Returns `null` when the text is not a number.
 */
export function parseInputNumber(text: string): number | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}
