import { describe, expect, it } from 'vitest'

import { insertAt, MESSAGE_KEYS, PLACEHOLDERS, placeholderText } from './placeholders'

describe('insertAt', () => {
  it('puts the text at the cursor and moves the cursor after it', () => {
    expect(insertAt('Bok !', '{klijent}', 4, 4)).toEqual({ text: 'Bok {klijent}!', cursor: 13 })
  })

  it('replaces a selection', () => {
    expect(insertAt('Bok XXX!', '{klijent}', 4, 7)).toEqual({ text: 'Bok {klijent}!', cursor: 13 })
  })

  it('works at the ends and keeps a stray cursor inside the text', () => {
    expect(insertAt('', '{link}', 0, 0)).toEqual({ text: '{link}', cursor: 6 })
    expect(insertAt('a', '{link}', 99, 99)).toEqual({ text: 'a{link}', cursor: 7 })
    expect(insertAt('abc', 'X', -5, -5)).toEqual({ text: 'Xabc', cursor: 1 })
    expect(insertAt('abc', 'X', 2, 1)).toEqual({ text: 'abXc', cursor: 3 })
  })
})

describe('placeholders', () => {
  it('are the contract’s eight, written in braces', () => {
    expect(PLACEHOLDERS).toHaveLength(8)
    expect(placeholderText('vrijeme_od')).toBe('{vrijeme_od}')
  })

  it('the message keys are the contract’s four', () => {
    expect([...MESSAGE_KEYS].sort()).toEqual(
      ['on_the_way', 'reminder_day_before', 'report_ready', 'reschedule_ack'].sort(),
    )
  })
})
