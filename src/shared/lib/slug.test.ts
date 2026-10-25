import { describe, expect, it } from 'vitest'

import { toKey, uniqueKey } from './slug'

describe('toKey', () => {
  it('makes a snake_case word of a Croatian label', () => {
    expect(toKey('Broj zona')).toBe('broj_zona')
    expect(toKey('Šifra čuvara / ćelija')).toBe('sifra_cuvara_celija')
    expect(toKey('Đurđevac')).toBe('djurdjevac')
    expect(toKey('  Ključ  –  ormarić  ')).toBe('kljuc_ormaric')
  })

  it('does not start with a digit and is cut at the limit', () => {
    expect(toKey('3 zone')).toBe('f_3_zone')
    expect(toKey('a'.repeat(100))).toHaveLength(63)
    expect(toKey('ab cd', 4)).toBe('ab_c')
    expect(toKey('ab cd', 3)).toBe('ab')
  })

  it('is empty when nothing usable is left', () => {
    expect(toKey('')).toBe('')
    expect(toKey('!!!')).toBe('')
  })

  it('matches the contract’s pattern when there is anything', () => {
    for (const text of ['Broj zona', '3 zone', 'Šifra', 'x'.repeat(80), 'A-B-C']) {
      expect(toKey(text)).toMatch(/^[a-z][a-z0-9_]{0,62}$/)
    }
  })
})

describe('uniqueKey', () => {
  it('keeps a free key and numbers a taken one', () => {
    expect(uniqueKey('zona', new Set())).toBe('zona')
    expect(uniqueKey('zona', new Set(['zona']))).toBe('zona_2')
    expect(uniqueKey('zona', new Set(['zona', 'zona_2']))).toBe('zona_3')
  })

  it('stays within the limit when numbering', () => {
    const long = 'a'.repeat(63)
    const result = uniqueKey(long, new Set([long]))
    expect(result).toHaveLength(63)
    expect(result.endsWith('_2')).toBe(true)
  })
})
