import { describe, expect, it } from 'vitest'

import { currencyOptions, timeZoneOptions } from './intl-options'

describe('timeZoneOptions', () => {
  it('lists the runtime zones with readable names', () => {
    const options = timeZoneOptions()
    expect(options).toContainEqual({ value: 'Europe/Zagreb', label: 'Europe/Zagreb' })
    expect(options).toContainEqual({ value: 'America/New_York', label: 'America/New York' })
  })

  it('keeps a zone the runtime does not list', () => {
    expect(timeZoneOptions('Mars/Olympus')[0]).toEqual({
      value: 'Mars/Olympus',
      label: 'Mars/Olympus',
    })
  })
})

describe('currencyOptions', () => {
  it('names currencies in the locale', () => {
    const eur = currencyOptions('hr-HR').find((option) => option.value === 'EUR')
    expect(eur?.label).toMatch(/^EUR – /)
  })

  it('keeps the current code and survives a locale the runtime rejects', () => {
    expect(currencyOptions('not a locale', 'XXY')[0]).toEqual({ value: 'XXY', label: 'XXY' })
  })
})
