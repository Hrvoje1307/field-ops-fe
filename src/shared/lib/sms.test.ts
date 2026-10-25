import { describe, expect, it } from 'vitest'

import { fitsGsm7, unicodeOnlyCharacters } from './sms'

describe('fitsGsm7', () => {
  it('accepts plain text, digits, punctuation, line breaks and the euro sign', () => {
    expect(fitsGsm7('Monter dolazi sutra u 09:00 (nalog RN-1). Hvala!\n€')).toBe(true)
    expect(fitsGsm7('')).toBe(true)
  })

  it('refuses the Croatian letters outside GSM-7', () => {
    for (const letter of ['č', 'ć', 'š', 'ž', 'đ', 'Č', 'Ć', 'Š', 'Ž', 'Đ']) {
      expect(fitsGsm7(`a${letter}b`), letter).toBe(false)
    }
  })
})

describe('unicodeOnlyCharacters', () => {
  it('names the characters that need UCS-2, once each', () => {
    expect(unicodeOnlyCharacters('Poštovani, čekamo vas u šest; žurimo, šaljemo')).toEqual([
      'š',
      'č',
      'ž',
    ])
    expect(unicodeOnlyCharacters('Plain text')).toEqual([])
  })
})
