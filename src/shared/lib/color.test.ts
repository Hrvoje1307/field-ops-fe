import { describe, expect, it } from 'vitest'

import { readableTextColor } from './color'
import { initials } from './initials'

describe('readableTextColor', () => {
  it('picks white on dark and black on light backgrounds', () => {
    expect(readableTextColor('#2563eb')).toBe('#ffffff')
    expect(readableTextColor('#16a34a')).toBe('#000000')
    expect(readableTextColor('#f59e0b')).toBe('#000000')
    expect(readableTextColor('#000000')).toBe('#ffffff')
    expect(readableTextColor('#FFFFFF')).toBe('#000000')
  })

  it('falls back to black for anything that is not #rrggbb', () => {
    expect(readableTextColor('blue')).toBe('#000000')
  })
})

describe('initials', () => {
  it('takes the first letters of up to two names', () => {
    expect(initials('Ana Horvat')).toBe('AH')
    expect(initials('  ivan   marko  kovač ')).toBe('IM')
    expect(initials('Đuro')).toBe('Đ')
  })
})
