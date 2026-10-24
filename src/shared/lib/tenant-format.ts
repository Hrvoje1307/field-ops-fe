import { createContext, useContext, useMemo } from 'react'

import { formatDate, formatDateTime, formatTime, todayInTimeZone } from './datetime'
import { formatMoney, type MoneyString } from './money'
import { formatPhone, type CountryCode } from './phone'

/** The tenant settings formatters need. Provided by the app from `/tenant`. */
export interface TenantFormatSettings {
  timeZone: string
  locale: string
  currency: string
  /** Phone country; for now derived from the locale region (docs/backend-questions.md #15). */
  country: CountryCode | undefined
}

/** CLAUDE.md fallbacks, used before the tenant is known (e.g. on the login page). */
export const DEFAULT_TENANT_FORMAT: TenantFormatSettings = {
  timeZone: 'Europe/Zagreb',
  locale: 'hr-HR',
  currency: 'EUR',
  country: 'HR',
}

export const TenantFormatContext = createContext<TenantFormatSettings>(DEFAULT_TENANT_FORMAT)

export interface TenantFormat extends TenantFormatSettings {
  /** Plain tenant-local date (`yyyy-MM-dd`). */
  formatDate: (date: string, options?: Intl.DateTimeFormatOptions) => string
  /** Instant → `HH:mm` in the tenant zone. */
  formatTime: (instant: string) => string
  formatDateTime: (instant: string, options?: Intl.DateTimeFormatOptions) => string
  /** E.164 → national format for the tenant's country, E.164 otherwise. */
  formatPhone: (e164: string) => string
  formatMoney: (amount: MoneyString) => string
  /** Today's date in the tenant zone. */
  today: () => string
}

/** Formatters bound to the current tenant's time zone, locale, currency and country. */
export function useTenantFormat(): TenantFormat {
  const settings = useContext(TenantFormatContext)
  return useMemo(
    () => ({
      ...settings,
      formatDate: (date, options) => formatDate(date, settings, options),
      formatTime: (instant) => formatTime(instant, settings),
      formatDateTime: (instant, options) => formatDateTime(instant, settings, options),
      formatPhone: (e164) => formatPhone(e164, settings.country),
      formatMoney: (amount) => formatMoney(amount, settings),
      today: () => todayInTimeZone(settings.timeZone),
    }),
    [settings],
  )
}
