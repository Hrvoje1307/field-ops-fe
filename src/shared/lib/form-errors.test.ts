import { describe, expect, it, vi } from 'vitest'

import { applyFieldErrors } from './form-errors'

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
