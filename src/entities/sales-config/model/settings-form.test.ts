import { describe, expect, it } from 'vitest'

import type { SalesSettings } from '@/shared/api/generated/model'

import {
  aiFormValues,
  buildAiSchema,
  dataLossOf,
  digestFormValues,
  isLanguageTag,
  languageName,
  tenantLanguage,
  toAiFields,
} from './settings-form'

const settings: SalesSettings = {
  aiEnabled: true,
  signature: null,
  tone: 'neutral',
  replyLanguage: 'auto',
  knowledge: null,
  responseSlaHours: 4,
  digestEnabled: true,
  digestTime: '07:45',
  digestRecipientIds: ['a', 'b'],
  storeNonSalesBodies: true,
  retentionDays: null,
  reviewThreshold: 0.7,
}

describe('language', () => {
  it('accepts BCP-47 tags and refuses everything else, including "auto"', () => {
    for (const tag of ['hr', 'en-GB', 'sr-Latn', 'zh-Hant-TW'])
      expect(isLanguageTag(tag)).toBe(true)
    for (const tag of ['', 'auto', 'xx_yy', 'en GB', 'hrvatski-', 'e', 'hr-']) {
      expect(isLanguageTag(tag)).toBe(false)
    }
  })
  it('takes the tenant language from its locale and names it in the interface language', () => {
    expect(tenantLanguage('hr-HR')).toBe('hr')
    expect(tenantLanguage('not a locale')).toBeUndefined()
    expect(languageName('de', 'hr')).toBe('njemački')
  })
  it('shows a stored tag that is neither "auto" nor the tenant language as "other"', () => {
    expect(aiFormValues({ ...settings, replyLanguage: 'hr' }, 'hr').language).toBe('hr')
    const other = aiFormValues({ ...settings, replyLanguage: 'de' }, 'hr')
    expect([other.language, other.customLanguage]).toEqual(['other', 'de'])
    expect(toAiFields({ ...other, customLanguage: 'en-GB' }).replyLanguage).toBe('en-GB')
  })
})

describe('the AI form', () => {
  it('shows the threshold as a percent and sends a number from 0 to 1', () => {
    const values = aiFormValues({ ...settings, reviewThreshold: 0.85 }, 'hr')
    expect(values.reviewThreshold).toBe('85')
    expect(toAiFields({ ...values, reviewThreshold: '7' }).reviewThreshold).toBe(0.07)
    expect(toAiFields({ ...values, reviewThreshold: '100' }).reviewThreshold).toBe(1)
  })
  it('sends empty text as null and an empty retention as "keep"', () => {
    const fields = toAiFields(aiFormValues(settings, 'hr'))
    expect(fields).toMatchObject({ signature: null, knowledge: null, retentionDays: null })
  })
  it('limits knowledge to 20 000 characters, the hours to 1–168 and the retention to 30+ days', () => {
    const schema = buildAiSchema()
    const ok = aiFormValues(settings, 'hr')
    expect(schema.safeParse(ok).success).toBe(true)
    expect(schema.safeParse({ ...ok, knowledge: 'x'.repeat(20_000) }).success).toBe(true)
    expect(schema.safeParse({ ...ok, knowledge: 'x'.repeat(20_001) }).success).toBe(false)
    for (const hours of ['0', '169', '1.5', '']) {
      expect(schema.safeParse({ ...ok, responseSlaHours: hours }).success).toBe(false)
    }
    expect(schema.safeParse({ ...ok, retentionDays: '29' }).success).toBe(false)
    expect(schema.safeParse({ ...ok, retentionDays: '30' }).success).toBe(true)
    expect(schema.safeParse({ ...ok, threshold: '101', reviewThreshold: '101' }).success).toBe(
      false,
    )
    expect(schema.safeParse({ ...ok, language: 'other', customLanguage: 'nope_' }).success).toBe(
      false,
    )
  })
})

describe('what a save deletes', () => {
  it('turning off the storing of non-sales bodies deletes; turning it on or leaving it does not', () => {
    expect(dataLossOf(settings, { storeNonSalesBodies: false })).toEqual(['nonSalesBodies'])
    expect(
      dataLossOf({ ...settings, storeNonSalesBodies: false }, { storeNonSalesBodies: false }),
    ).toEqual([])
    expect(
      dataLossOf({ ...settings, storeNonSalesBodies: false }, { storeNonSalesBodies: true }),
    ).toEqual([])
  })
  it('setting a retention or shortening it deletes; keeping, lengthening or removing it does not', () => {
    expect(dataLossOf(settings, { retentionDays: 90 })).toEqual(['retention'])
    expect(dataLossOf({ ...settings, retentionDays: 90 }, { retentionDays: 60 })).toEqual([
      'retention',
    ])
    expect(dataLossOf({ ...settings, retentionDays: 90 }, { retentionDays: 90 })).toEqual([])
    expect(dataLossOf({ ...settings, retentionDays: 90 }, { retentionDays: 180 })).toEqual([])
    expect(dataLossOf({ ...settings, retentionDays: 90 }, { retentionDays: null })).toEqual([])
  })
})

describe('the digest form', () => {
  it('leaves out recipients who no longer have access to Prodaja', () => {
    expect(digestFormValues(settings, ['b', 'c']).digestRecipientIds).toEqual(['b'])
  })
})
