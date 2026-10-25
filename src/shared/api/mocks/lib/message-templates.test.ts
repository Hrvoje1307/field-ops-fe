import { describe, expect, it } from 'vitest'

import { PLATFORM_DEFAULTS, renderBody, smsSegments } from './message-templates'

describe('renderBody', () => {
  it('fills the known placeholders and reports the others once, leaving them in', () => {
    const { rendered, unknown } = renderBody(
      'Bok {klijent}, {nepoznato} i {nepoznato}, {broj_naloga}.',
    )
    expect(rendered).toBe('Bok Ivan Horvat, {nepoznato} i {nepoznato}, RN-2026-0042.')
    expect(unknown).toEqual(['nepoznato'])
  })

  it('leaves text without placeholders alone', () => {
    expect(renderBody('Bez mjesta')).toEqual({ rendered: 'Bez mjesta', unknown: [] })
  })

  it('every platform default only uses known placeholders', () => {
    for (const template of PLATFORM_DEFAULTS) {
      expect(renderBody(template.body).unknown, template.id).toEqual([])
      expect(renderBody(template.subject ?? '').unknown, template.id).toEqual([])
    }
  })
})

describe('smsSegments', () => {
  it('counts GSM-7 text at 160 and then 153 per message', () => {
    expect(smsSegments('')).toEqual({ length: 0, segments: 0 })
    expect(smsSegments('a'.repeat(160))).toEqual({ length: 160, segments: 1 })
    expect(smsSegments('a'.repeat(161))).toEqual({ length: 161, segments: 2 })
    expect(smsSegments('a'.repeat(306))).toEqual({ length: 306, segments: 2 })
    expect(smsSegments('a'.repeat(307))).toEqual({ length: 307, segments: 3 })
  })

  it('counts a character of the extension table twice', () => {
    expect(smsSegments('€'.repeat(80))).toEqual({ length: 160, segments: 1 })
    expect(smsSegments('€'.repeat(81))).toEqual({ length: 162, segments: 2 })
  })

  it('one character outside GSM-7 (č, ć, š, ž, đ) makes the whole text UCS-2: 70, then 67', () => {
    expect(smsSegments('č'.repeat(70))).toEqual({ length: 70, segments: 1 })
    expect(smsSegments('č'.repeat(71))).toEqual({ length: 71, segments: 2 })
    expect(smsSegments(`${'a'.repeat(100)}š`)).toEqual({ length: 101, segments: 2 })
    expect(smsSegments('č'.repeat(134))).toEqual({ length: 134, segments: 2 })
    expect(smsSegments('č'.repeat(135))).toEqual({ length: 135, segments: 3 })
  })
})
