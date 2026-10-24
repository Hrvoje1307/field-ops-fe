import { createContext, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  dateInTimeZone,
  daysBetween,
  formatDate,
  formatDateTime,
  formatTime,
  todayInTimeZone,
} from './datetime'
import { formatDuration } from './duration'
import { formatMoney, type MoneyString } from './money'
import { formatNumber } from './number'
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
  /**
   * Plain tenant-local date relative to today in the tenant zone: `Danas`, `Sutra`,
   * `Jučer`, otherwise weekday and date (`uto, 27. 10.`).
   */
  formatRelativeDay: (date: string) => string
  /** Instant as relative day and time in the tenant zone: `Danas u 08:30`. */
  formatRelativeDateTime: (instant: string) => string
  /** Minutes: `45 min`, `1 h 30 min`. */
  formatDuration: (minutes: number) => string
  formatNumber: (value: number) => string
  /** E.164 → national format for the tenant's country, E.164 otherwise. */
  formatPhone: (e164: string) => string
  formatMoney: (amount: MoneyString) => string
  /** Today's date in the tenant zone. */
  today: () => string
}

/** Formatters bound to the current tenant's time zone, locale, currency and country. */
export function useTenantFormat(): TenantFormat {
  const settings = useContext(TenantFormatContext)
  const { t } = useTranslation()
  return useMemo(() => {
    const relativeDay = (date: string) => {
      const offset = daysBetween(todayInTimeZone(settings.timeZone), date)
      if (offset === 0) return t('common.relativeDay.today')
      if (offset === 1) return t('common.relativeDay.tomorrow')
      if (offset === -1) return t('common.relativeDay.yesterday')
      return formatDate(date, settings, { weekday: 'short', day: 'numeric', month: 'numeric' })
    }
    return {
      ...settings,
      formatDate: (date, options) => formatDate(date, settings, options),
      formatTime: (instant) => formatTime(instant, settings),
      formatDateTime: (instant, options) => formatDateTime(instant, settings, options),
      formatRelativeDay: relativeDay,
      formatRelativeDateTime: (instant) =>
        t('common.dayAtTime', {
          day: relativeDay(dateInTimeZone(instant, settings.timeZone)),
          time: formatTime(instant, settings),
        }),
      formatDuration: (minutes) => formatDuration(minutes, settings.locale),
      formatNumber: (value) => formatNumber(value, settings.locale),
      formatPhone: (e164) => formatPhone(e164, settings.country),
      formatMoney: (amount) => formatMoney(amount, settings),
      today: () => todayInTimeZone(settings.timeZone),
    }
  }, [settings, t])
}
