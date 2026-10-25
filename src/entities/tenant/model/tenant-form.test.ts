import { describe, expect, it } from 'vitest'

import type { Tenant } from '@/shared/api/generated/model'

import { buildTenantSchema, toTenantBody, tenantFormValues } from './tenant-form'

const tenant: Tenant = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'demo',
  name: 'Demo d.o.o.',
  oib: '12345678903',
  address: 'Ilica 1, Zagreb',
  phone: null,
  email: 'info@demo.test',
  iban: null,
  logoAttachmentId: null,
  logoUrl: null,
  locale: 'hr-HR',
  timezone: 'Europe/Zagreb',
  currency: 'EUR',
  plan: 'pro',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  settings: {
    requireSignature: true,
    reminderSendTime: '17:00',
    smsSenderName: 'DEMO',
    onTheWaySmsEnabled: false,
    publicLinkValidityHours: 72,
    jobNumberPrefix: 'RN',
    pdfAccentColor: '#b91c1c',
    pdfFooter: 'Demo',
  },
}

const messages = (change: (values: ReturnType<typeof tenantFormValues>) => void) => {
  const values = tenantFormValues(tenant)
  change(values)
  const result = buildTenantSchema().safeParse(values)
  const found: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) found[issue.path.join('.')] = issue.message
  }
  return found
}

describe('tenant form', () => {
  it('a stored company is valid as it is', () => {
    expect(messages(() => undefined)).toEqual({})
  })

  it('needs a name, a plain 11-digit OIB, a valid e-mail', () => {
    expect(
      messages((v) => {
        v.name = ' a '
        v.oib = '123'
        v.email = 'nope'
      }),
    ).toEqual({
      name: 'Upišite naziv tvrtke.',
      oib: 'OIB ima 11 znamenki.',
      email: 'Upišite ispravan email.',
    })
    expect(messages((v) => (v.oib = ''))).toEqual({})
  })

  it('checks the locale, the time zone and the currency', () => {
    expect(
      messages((v) => {
        v.locale = 'hr_HR!'
        v.timezone = 'Mars/Olympus'
        v.currency = 'EURO'
      }),
    ).toEqual({
      locale: 'Upišite jezik i državu, npr. hr-HR.',
      timezone: 'Odaberite vremensku zonu.',
      currency: 'Valuta ima tri slova, npr. EUR.',
    })
  })

  it('checks times, the colour, the sender and the link validity', () => {
    expect(
      messages((v) => {
        v.settings.reminderSendTime = '25:00'
        v.settings.pdfAccentColor = 'red'
        v.settings.smsSenderName = '123456789012'
        v.settings.publicLinkValidityHours = '0'
      }),
    ).toEqual({
      'settings.reminderSendTime': 'Upišite vrijeme, npr. 17:00.',
      'settings.pdfAccentColor': 'Upišite boju kao #rrggbb.',
      'settings.smsSenderName': 'Naziv pošiljatelja ima najviše 11 znakova.',
      'settings.publicLinkValidityHours': 'Upišite broj sati, najmanje 1.',
    })
  })

  it('quiet hours come as a pair', () => {
    expect(
      messages((v) => {
        v.settings.smsQuietHoursStart = '21:00'
      }),
    ).toEqual({ 'settings.smsQuietHoursEnd': 'Upišite oba vremena ili nijedno.' })
    expect(
      messages((v) => {
        v.settings.smsQuietHoursStart = '21:00'
        v.settings.smsQuietHoursEnd = '07:00'
      }),
    ).toEqual({})
  })

  it('sends what was typed, empty optional texts as null', () => {
    const values = tenantFormValues(tenant)
    values.name = '  Novo ime '
    values.address = ' '
    values.currency = 'eur'
    const body = toTenantBody(values)
    expect(body).toMatchObject({
      name: 'Novo ime',
      oib: '12345678903',
      address: null,
      phone: null,
      logoAttachmentId: null,
      currency: 'EUR',
    })
  })

  it('leaves an empty OIB out and keeps the logo that was chosen', () => {
    const values = tenantFormValues(tenant)
    values.oib = ''
    values.logoAttachmentId = 'abc'
    const body = toTenantBody(values)
    expect('oib' in body).toBe(false)
    expect(body.logoAttachmentId).toBe('abc')
  })

  it('leaves unset settings out instead of sending them empty', () => {
    const values = tenantFormValues(tenant)
    values.settings.reminderSendTime = ''
    values.settings.pdfFooter = ''
    values.settings.publicLinkValidityHours = ''
    const { settings } = toTenantBody(values)
    // No key at all (a key with no value is not the same as no key)
    expect(Object.keys(settings).sort()).toEqual([
      'jobNumberPrefix',
      'onTheWaySmsEnabled',
      'pdfAccentColor',
      'requireSignature',
      'smsSenderName',
    ])
    expect(settings).toEqual({
      requireSignature: true,
      onTheWaySmsEnabled: false,
      smsSenderName: 'DEMO',
      jobNumberPrefix: 'RN',
      pdfAccentColor: '#b91c1c',
    })
  })

  it('sends the link validity as a number and quiet hours as typed', () => {
    const values = tenantFormValues(tenant)
    values.settings.smsQuietHoursStart = '21:00'
    values.settings.smsQuietHoursEnd = '07:00'
    expect(toTenantBody(values).settings).toMatchObject({
      publicLinkValidityHours: 72,
      smsQuietHoursStart: '21:00',
      smsQuietHoursEnd: '07:00',
    })
  })
})
