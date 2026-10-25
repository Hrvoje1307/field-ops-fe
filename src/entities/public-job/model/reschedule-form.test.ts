import { describe, expect, it } from 'vitest'

import { buildRescheduleSchema, emptyReschedule, toRescheduleBody } from './reschedule-form'

const messages = (values: object, today = '2026-10-15') => {
  const result = buildRescheduleSchema(today).safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('reschedule form', () => {
  it('nothing typed is fine: the office is asked for another time all the same', () => {
    expect(messages(emptyReschedule)).toEqual([])
    expect(toRescheduleBody(emptyReschedule)).toEqual({})
  })

  it('a note up to 500 characters, dates from today on, none twice', () => {
    expect(messages({ note: 'x'.repeat(500), dates: ['2026-10-15', '', ''] })).toEqual([])
    expect(messages({ note: 'x'.repeat(501), dates: ['', '', ''] })).toEqual([
      'note: Napomena ima najviše 500 znakova.',
    ])
    expect(messages({ note: '', dates: ['2026-10-14', '', ''] })).toEqual([
      'dates.0: Odaberite dan od danas nadalje.',
    ])
    expect(messages({ note: '', dates: ['bok', '', ''] })).toContain(
      'dates.0: Upišite ispravan datum.',
    )
    expect(messages({ note: '', dates: ['2026-10-20', '', '2026-10-20'] })).toEqual([
      'dates.2: Taj dan je već odabran.',
    ])
  })

  it('sends only what was filled in: a trimmed note, the days once and in order', () => {
    expect(
      toRescheduleBody({ note: '  Poslije podne.  ', dates: ['2026-10-22', '', '2026-10-20'] }),
    ).toEqual({ note: 'Poslije podne.', preferredDates: ['2026-10-20', '2026-10-22'] })
    expect(toRescheduleBody({ note: '   ', dates: ['', '', ''] })).toEqual({})
  })
})
