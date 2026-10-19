import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export type { CountryCode }

/**
 * The tenant's country, taken from its locale region (`hr-HR` → `HR`, `en-US` → `US`).
 * The API has no separate country field (see docs/backend-questions.md).
 */
export function countryFromLocale(locale: string): CountryCode | undefined {
  try {
    const { region } = new Intl.Locale(locale).maximize()
    return region && isSupportedCountry(region) ? region : undefined
  } catch {
    return undefined
  }
}

/**
 * Any input format → E.164. National numbers are read in the tenant's country.
 * Returns null when the input isn't a valid phone number.
 */
export function normalizePhone(input: string, tenantCountry?: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(input, tenantCountry)
  return parsed?.isValid() ? parsed.number : null
}

/**
 * Display format: national format for numbers from the tenant's country,
 * E.164 for everything else (and for anything unparseable).
 */
export function formatPhone(e164: string, tenantCountry?: CountryCode): string {
  const parsed = parsePhoneNumberFromString(e164)
  if (!parsed?.isValid() || !tenantCountry || parsed.country !== tenantCountry) return e164
  return parsed.formatNational()
}
