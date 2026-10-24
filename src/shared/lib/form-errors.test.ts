import { describe, expect, it, vi } from 'vitest'

import { applyFieldErrors, applyServerFieldErrors, dottedPath } from './form-errors'

describe('applyFieldErrors', () => {
  it('puts messages on the fields with the same path and returns the rest', () => {
    const setError = vi.fn()
    const unmatched = applyFieldErrors(
      setError,
      {
        title: ['Obavezno polje.'],
        'firstLocation.customFields.size': ['Previše.', 'Mora biti cijeli broj.'],
        'customFields.removed_field': ['Polje ne postoji.'],
        version: [],
      },
      ['title', 'firstLocation.customFields.size'],
    )

    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenNthCalledWith(
      1,
      'title',
      { type: 'server', message: 'Obavezno polje.' },
      { shouldFocus: true },
    )
    expect(setError).toHaveBeenNthCalledWith(
      2,
      'firstLocation.customFields.size',
      { type: 'server', message: 'Previše. Mora biti cijeli broj.' },
      { shouldFocus: false },
    )
    expect(unmatched).toEqual(['Polje ne postoji.'])
  })
})

describe('applyServerFieldErrors', () => {
  it('converts bracket indexes and only takes paths the form has', () => {
    const set: Record<string, string> = {}
    const setError = ((path: string, error: { message: string }) => {
      set[path] = error.message
    }) as never
    const values = {
      name: '',
      contacts: [{ phone: '' }, { phone: '' }],
      customFields: { s: { masked: true } },
    }
    const unmatched = applyServerFieldErrors(
      setError,
      { 'contacts[1].phone': ['Neispravan broj.'], 'customFields.s': ['Obavezno.'], other: ['X'] },
      values,
    )
    expect(set).toEqual({ 'contacts.1.phone': 'Neispravan broj.', 'customFields.s': 'Obavezno.' })
    expect(unmatched).toEqual(['X'])
    expect(dottedPath('firstLocation.customFields.a')).toBe('firstLocation.customFields.a')
  })
})
