import { describe, expect, it } from 'vitest'

import {
  addDays,
  dateInTimeZone,
  formatDate,
  formatDateTime,
  formatTime,
  timeInTimeZone,
  todayInTimeZone,
  zonedDateTimeToInstant,
} from './datetime'

const ZAGREB = { timeZone: 'Europe/Zagreb', locale: 'hr-HR' }
const NEW_YORK = { timeZone: 'America/New_York', locale: 'en-US' }

describe('zonedDateTimeToInstant', () => {
  it('converts tenant-local wall time in Zagreb (CEST and CET)', () => {
    expect(zonedDateTimeToInstant('2026-10-16', '08:00', ZAGREB.timeZone)).toBe(
      '2026-10-16T06:00:00Z',
    )
    expect(zonedDateTimeToInstant('2026-12-01', '08:00', ZAGREB.timeZone)).toBe(
      '2026-12-01T07:00:00Z',
    )
  })

  it('uses the tenant time zone, not a fixed offset (New York, EST vs EDT)', () => {
    expect(zonedDateTimeToInstant('2026-01-15', '08:00', NEW_YORK.timeZone)).toBe(
      '2026-01-15T13:00:00Z',
    )
    expect(zonedDateTimeToInstant('2026-07-15', '08:00', NEW_YORK.timeZone)).toBe(
      '2026-07-15T12:00:00Z',
    )
  })

  describe('New York spring-forward (2026-03-08, 02:00 → 03:00)', () => {
    it('keeps the offset before and after the gap', () => {
      expect(zonedDateTimeToInstant('2026-03-08', '01:30', NEW_YORK.timeZone)).toBe(
        '2026-03-08T06:30:00Z',
      )
      expect(zonedDateTimeToInstant('2026-03-08', '03:30', NEW_YORK.timeZone)).toBe(
        '2026-03-08T07:30:00Z',
      )
    })

    it('moves a skipped wall time forward by the gap', () => {
      // 02:30 doesn't exist that night; "compatible" disambiguation gives 03:30 EDT
      const instant = zonedDateTimeToInstant('2026-03-08', '02:30', NEW_YORK.timeZone)
      expect(instant).toBe('2026-03-08T07:30:00Z')
      expect(timeInTimeZone(instant, NEW_YORK.timeZone)).toBe('03:30')
    })
  })

  describe('New York fall-back (2026-11-01, 02:00 → 01:00)', () => {
    it('takes the earlier instant for a repeated wall time', () => {
      // 01:30 happens twice: EDT (05:30Z) and EST (06:30Z)
      expect(zonedDateTimeToInstant('2026-11-01', '01:30', NEW_YORK.timeZone)).toBe(
        '2026-11-01T05:30:00Z',
      )
    })

    it('shows both repeated instants as 01:30 local', () => {
      expect(formatTime('2026-11-01T05:30:00Z', NEW_YORK)).toBe('01:30')
      expect(formatTime('2026-11-01T06:30:00Z', NEW_YORK)).toBe('01:30')
    })

    it('uses EST after the change', () => {
      expect(zonedDateTimeToInstant('2026-11-01', '09:00', NEW_YORK.timeZone)).toBe(
        '2026-11-01T14:00:00Z',
      )
    })
  })

  it('rejects malformed input', () => {
    expect(() => zonedDateTimeToInstant('2026-13-01', '25:00', ZAGREB.timeZone)).toThrow(RangeError)
  })
})

describe('tenant-local dates', () => {
  it('puts the same instant on different calendar days per tenant', () => {
    // 03:30Z on 1 Nov = 23:30 EDT on 31 Oct in New York, 04:30 CET on 1 Nov in Zagreb
    expect(dateInTimeZone('2026-11-01T03:30:00Z', NEW_YORK.timeZone)).toBe('2026-10-31')
    expect(dateInTimeZone('2026-11-01T03:30:00Z', ZAGREB.timeZone)).toBe('2026-11-01')
  })

  it('computes "today" in the tenant time zone', () => {
    const now = new Date('2026-03-08T04:30:00Z') // 23:30 EST on 7 Mar in New York
    expect(todayInTimeZone(NEW_YORK.timeZone, now)).toBe('2026-03-07')
    expect(todayInTimeZone(ZAGREB.timeZone, now)).toBe('2026-03-08')
  })

  it('adds calendar days across a DST change without drifting', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatting with tenant settings', () => {
  it('formats the time in the tenant zone, not the browser zone', () => {
    const instant = '2026-07-15T12:00:00Z'
    expect(formatTime(instant, ZAGREB)).toBe('14:00')
    expect(formatTime(instant, NEW_YORK)).toBe('08:00')
  })

  it('formats date and time per tenant locale and zone', () => {
    const instant = '2026-11-01T06:30:00Z'
    expect(
      formatDateTime(instant, NEW_YORK, {
        dateStyle: 'short',
        timeStyle: 'short',
        hourCycle: 'h23',
      }),
    ).toBe('11/1/26, 01:30')
    expect(
      formatDateTime(instant, ZAGREB, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    ).toContain('07:30')
  })

  it('never shifts a plain date by a time zone', () => {
    expect(
      formatDate('2026-11-01', NEW_YORK, { year: 'numeric', month: 'long', day: 'numeric' }),
    ).toBe('November 1, 2026')
    expect(
      formatDate('2026-11-01', ZAGREB, { year: 'numeric', month: '2-digit', day: '2-digit' }),
    ).toMatch(/^01\. ?11\. ?2026\.$/)
  })
})
