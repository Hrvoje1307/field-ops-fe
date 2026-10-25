import { z } from 'zod'

import type { Tenant, TenantSettings, TenantUpdate } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

/** Settings as typed in the form: texts and booleans only, empty text meaning "not set". */
export interface TenantSettingsFormValues {
  requireSignature: boolean
  reminderSendTime: string
  smsSenderName: string
  smsQuietHoursStart: string
  smsQuietHoursEnd: string
  onTheWaySmsEnabled: boolean
  publicLinkValidityHours: string
  jobNumberPrefix: string
  pdfAccentColor: string
  pdfFooter: string
}

/** The company as typed in the form. Paths mirror `TenantUpdate`, so 400 errors map onto inputs. */
export interface TenantFormValues {
  name: string
  oib: string
  address: string
  phone: string
  email: string
  iban: string
  locale: string
  timezone: string
  currency: string
  /** The confirmed logo file, empty for none. */
  logoAttachmentId: string
  settings: TenantSettingsFormValues
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^#[0-9a-fA-F]{6}$/
const SENDER_MAX = 11

const text = () => z.string().trim()

function isLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export function buildTenantSchema() {
  const t = i18n.t.bind(i18n)
  const optional = (pattern: RegExp, message: string) =>
    text().refine((value) => value === '' || pattern.test(value), message)
  return z
    .object({
      name: text().min(2, t('settings.company.errors.nameRequired')),
      oib: optional(/^\d{11}$/, t('settings.company.errors.oibInvalid')),
      address: text(),
      phone: text(),
      email: text().refine(
        (value) => value === '' || z.email().safeParse(value).success,
        t('common.errors.emailInvalid'),
      ),
      iban: text(),
      locale: text().refine(isLocale, t('settings.company.errors.localeInvalid')),
      timezone: text().refine(isTimeZone, t('settings.company.errors.timezoneInvalid')),
      currency: text().refine(
        (value) => /^[A-Za-z]{3}$/.test(value),
        t('settings.company.errors.currencyInvalid'),
      ),
      logoAttachmentId: z.string(),
      settings: z.object({
        requireSignature: z.boolean(),
        reminderSendTime: optional(TIME, t('settings.company.errors.timeInvalid')),
        smsSenderName: text().max(SENDER_MAX, t('settings.company.errors.senderTooLong')),
        smsQuietHoursStart: optional(TIME, t('settings.company.errors.timeInvalid')),
        smsQuietHoursEnd: optional(TIME, t('settings.company.errors.timeInvalid')),
        onTheWaySmsEnabled: z.boolean(),
        publicLinkValidityHours: optional(
          /^[1-9]\d{0,5}$/,
          t('settings.company.errors.validityInvalid'),
        ),
        jobNumberPrefix: text(),
        pdfAccentColor: optional(COLOR, t('settings.company.errors.colorInvalid')),
        pdfFooter: text(),
      }),
    })
    .superRefine((values, context) => {
      // Quiet hours are a pair: one end alone says nothing
      const { smsQuietHoursStart: start, smsQuietHoursEnd: end } = values.settings
      if ((start === '') !== (end === '')) {
        context.addIssue({
          code: 'custom',
          path: ['settings', start === '' ? 'smsQuietHoursStart' : 'smsQuietHoursEnd'],
          message: t('settings.company.errors.quietHoursBoth'),
        })
      }
    })
}

/** The form for a stored tenant. */
export function tenantFormValues(tenant: Tenant): TenantFormValues {
  const settings = tenant.settings
  return {
    name: tenant.name,
    oib: tenant.oib ?? '',
    address: tenant.address ?? '',
    phone: tenant.phone ?? '',
    email: tenant.email ?? '',
    iban: tenant.iban ?? '',
    locale: tenant.locale,
    timezone: tenant.timezone,
    currency: tenant.currency,
    logoAttachmentId: tenant.logoAttachmentId ?? '',
    settings: {
      requireSignature: settings.requireSignature ?? false,
      reminderSendTime: settings.reminderSendTime ?? '',
      smsSenderName: settings.smsSenderName ?? '',
      smsQuietHoursStart: settings.smsQuietHoursStart ?? '',
      smsQuietHoursEnd: settings.smsQuietHoursEnd ?? '',
      onTheWaySmsEnabled: settings.onTheWaySmsEnabled ?? false,
      publicLinkValidityHours:
        settings.publicLinkValidityHours === undefined
          ? ''
          : String(settings.publicLinkValidityHours),
      jobNumberPrefix: settings.jobNumberPrefix ?? '',
      pdfAccentColor: settings.pdfAccentColor ?? '',
      pdfFooter: settings.pdfFooter ?? '',
    },
  }
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())
const orUndefined = (value: string) => (value.trim() === '' ? undefined : value.trim())

/**
 * The request for the typed company. `PUT /tenant` replaces the whole settings object, so
 * a setting left empty is left out (the API's default applies), never sent empty.
 */
export function toTenantBody(values: TenantFormValues): TenantUpdate {
  const s = values.settings
  const settings: TenantSettings = {
    requireSignature: s.requireSignature,
    onTheWaySmsEnabled: s.onTheWaySmsEnabled,
    reminderSendTime: orUndefined(s.reminderSendTime),
    smsSenderName: orUndefined(s.smsSenderName),
    smsQuietHoursStart: orUndefined(s.smsQuietHoursStart),
    smsQuietHoursEnd: orUndefined(s.smsQuietHoursEnd),
    publicLinkValidityHours: s.publicLinkValidityHours.trim()
      ? Number(s.publicLinkValidityHours)
      : undefined,
    jobNumberPrefix: orUndefined(s.jobNumberPrefix),
    pdfAccentColor: orUndefined(s.pdfAccentColor),
    pdfFooter: orUndefined(s.pdfFooter),
  }
  return {
    name: values.name.trim(),
    // The contract's OIB is not nullable: no OIB means no field
    ...(orUndefined(values.oib) ? { oib: values.oib.trim() } : {}),
    address: orNull(values.address),
    phone: orNull(values.phone),
    email: orNull(values.email),
    iban: orNull(values.iban),
    logoAttachmentId: values.logoAttachmentId === '' ? null : values.logoAttachmentId,
    locale: values.locale.trim(),
    timezone: values.timezone.trim(),
    currency: values.currency.trim().toUpperCase(),
    settings: Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value !== undefined),
    ),
  }
}
