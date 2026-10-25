import type { SelectOption } from '@/shared/ui/select-field'

/** `current` is kept in the list even if the runtime doesn't know it, so it isn't lost. */
function withCurrent(values: readonly string[], current: string): string[] {
  return current !== '' && !values.includes(current) ? [current, ...values] : [...values]
}

/** The IANA time zones the runtime knows (`Europe/Zagreb`), for a select. */
export function timeZoneOptions(current = ''): SelectOption[] {
  return withCurrent(Intl.supportedValuesOf('timeZone'), current).map((zone) => ({
    value: zone,
    label: zone.replaceAll('_', ' '),
  }))
}

/** ISO 4217 currencies the runtime knows, named in `locale` ("EUR – euro"). */
export function currencyOptions(locale: string, current = ''): SelectOption[] {
  let names: Intl.DisplayNames | undefined
  try {
    names = new Intl.DisplayNames(locale, { type: 'currency' })
  } catch {
    names = undefined
  }
  return withCurrent(Intl.supportedValuesOf('currency'), current).map((code) => {
    const name = names?.of(code)
    return { value: code, label: name && name !== code ? `${code} – ${name}` : code }
  })
}
