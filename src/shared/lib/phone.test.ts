import { describe, expect, it } from 'vitest'

import { countryFromLocale, formatPhone, normalizePhone } from './phone'

describe('countryFromLocale', () => {
  it('takes the region from the tenant locale', () => {
    expect(countryFromLocale('hr-HR')).toBe('HR')
    expect(countryFromLocale('en-US')).toBe('US')
    expect(countryFromLocale('de-AT')).toBe('AT')
  })

  it('infers the likely region when the locale has none', () => {
    expect(countryFromLocale('hr')).toBe('HR')
  })

  it('returns undefined for garbage', () => {
    expect(countryFromLocale('not a locale')).toBeUndefined()
  })
})

describe('normalizePhone', () => {
  it.each([
    ['091 123 4567', 'HR', '+385911234567'],
    ['091/123-4567', 'HR', '+385911234567'],
    ['00385 91 123 4567', 'HR', '+385911234567'],
    ['+385 1 2345 678', 'HR', '+38512345678'],
    // Non-Croatian tenants read national numbers in their own country
    ['(212) 555-0123', 'US', '+12125550123'],
    ['030 1234567', 'DE', '+49301234567'],
    // International input works regardless of tenant country
    ['+1 212 555 0123', 'HR', '+12125550123'],
  ] as const)('%s in a %s tenant → %s', (input, country, expected) => {
    expect(normalizePhone(input, country)).toBe(expected)
  })

  it('reads the same national digits differently per tenant country', () => {
    expect(normalizePhone('030 1234567', 'DE')).toBe('+49301234567')
    expect(normalizePhone('030 1234567', 'HR')).not.toBe('+49301234567')
  })

  it.each(['12345', 'abc', ''])('rejects %j', (input) => {
    expect(normalizePhone(input, 'HR')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('shows numbers from the tenant country in national format', () => {
    expect(formatPhone('+385911234567', 'HR')).toBe('091 123 4567')
    expect(formatPhone('+12125550123', 'US')).toBe('(212) 555-0123')
  })

  it('shows foreign numbers as E.164', () => {
    expect(formatPhone('+12125550123', 'HR')).toBe('+12125550123')
    expect(formatPhone('+385911234567', 'US')).toBe('+385911234567')
  })

  it('falls back to the raw value when the country is unknown or the number is invalid', () => {
    expect(formatPhone('+385911234567', undefined)).toBe('+385911234567')
    expect(formatPhone('+38512', 'HR')).toBe('+38512')
  })
})
