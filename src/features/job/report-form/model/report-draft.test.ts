import { describe, expect, it } from 'vitest'

import {
  arrivalInstant,
  draftErrors,
  draftFromReport,
  draftToInput,
  inputOf,
  type ReportDraft,
} from './report-draft'

const ZAGREB = 'Europe/Zagreb'
const empty = { workDone: null, startedAt: null, finishedAt: null, labourMinutes: null }

describe('arrivalInstant', () => {
  it('is the last time the job went on site', () => {
    expect(
      arrivalInstant([
        { toStatus: 'en_route', changedAt: '2026-10-27T06:00:00Z' },
        { toStatus: 'on_site', changedAt: '2026-10-27T07:00:00Z' },
        { toStatus: 'on_hold', changedAt: '2026-10-27T08:00:00Z' },
        { toStatus: 'on_site', changedAt: '2026-10-27T09:00:00Z' },
      ]),
    ).toBe('2026-10-27T09:00:00Z')
    expect(arrivalInstant([])).toBeNull()
  })
})

describe('draftFromReport', () => {
  it('shows the saved times in the tenant zone', () => {
    expect(
      draftFromReport(
        {
          workDone: 'Gotovo',
          startedAt: '2026-10-27T07:00:00Z',
          finishedAt: '2026-10-27T09:30:00Z',
          labourMinutes: 150,
        },
        { timeZone: ZAGREB, arrival: null },
      ),
    ).toEqual({ workDone: 'Gotovo', started: '08:00', finished: '10:30', labour: '150' })
  })

  it('offers the arrival as the start when none is saved, and never over a saved one', () => {
    const arrival = '2026-10-27T07:15:00Z'
    expect(draftFromReport(empty, { timeZone: ZAGREB, arrival }).started).toBe('08:15')
    expect(
      draftFromReport(
        { ...empty, startedAt: '2026-10-27T06:00:00Z' },
        { timeZone: ZAGREB, arrival },
      ).started,
    ).toBe('07:00')
    expect(draftFromReport(empty, { timeZone: ZAGREB, arrival: null }).started).toBe('')
  })

  it('keeps a zero as zero', () => {
    expect(
      draftFromReport({ ...empty, labourMinutes: 0 }, { timeZone: ZAGREB, arrival: null }).labour,
    ).toBe('0')
  })
})

const draft = (overrides: Partial<ReportDraft> = {}): ReportDraft => ({
  workDone: 'Gotovo',
  started: '08:00',
  finished: '10:30',
  labour: '150',
  ...overrides,
})

describe('draftErrors', () => {
  it('is clean for a good draft and for empty times and minutes', () => {
    expect(draftErrors(draft())).toEqual({})
    expect(draftErrors(draft({ started: '', finished: '', labour: '' }))).toEqual({})
  })

  it('finds half-typed times, a finish before the start, and letters in the minutes', () => {
    expect(draftErrors(draft({ started: '8:0' }))).toEqual({ started: 'invalid' })
    expect(draftErrors(draft({ finished: '25:00' }))).toEqual({ finished: 'invalid' })
    expect(draftErrors(draft({ finished: '07:59' }))).toEqual({ finished: 'order' })
    expect(draftErrors(draft({ labour: '1h' }))).toEqual({ labour: 'invalid' })
  })
})

describe('draftToInput', () => {
  const context = { day: '2026-10-27', timeZone: ZAGREB }

  it('turns tenant-local times into instants on the given day', () => {
    expect(draftToInput(draft(), empty, context)).toEqual({
      workDone: 'Gotovo',
      startedAt: '2026-10-27T07:00:00Z',
      finishedAt: '2026-10-27T09:30:00Z',
      labourMinutes: 150,
    })
  })

  it('keeps the day of a time that was already saved (a job past midnight stays on its day)', () => {
    // 00:30 on the 27th in Zagreb (UTC+1), on a screen opened for the 28th
    const saved = { ...empty, startedAt: '2026-10-26T23:30:00Z' }
    expect(
      draftToInput(draft({ started: '00:45' }), saved, { day: '2026-10-28', timeZone: ZAGREB })
        .startedAt,
    ).toBe('2026-10-26T23:45:00Z')
  })

  it('empty fields are cleared (null); the work done too', () => {
    expect(
      draftToInput(draft({ workDone: '', started: '', finished: '', labour: '' }), empty, context),
    ).toEqual({ workDone: null, startedAt: null, finishedAt: null, labourMinutes: null })
  })

  it('a field with a mistake keeps what is saved, and the others still go', () => {
    const saved = {
      startedAt: '2026-10-27T06:00:00Z',
      finishedAt: '2026-10-27T08:00:00Z',
      labourMinutes: 60,
    }
    // Half a time for the start, letters in the minutes
    expect(
      draftToInput(draft({ started: '8:', labour: 'x', workDone: 'Novo' }), saved, context),
    ).toEqual({
      workDone: 'Novo',
      startedAt: '2026-10-27T06:00:00Z',
      finishedAt: '2026-10-27T09:30:00Z',
      labourMinutes: 60,
    })
    // A finish before the start
    expect(draftToInput(draft({ finished: '07:00' }), saved, context).finishedAt).toBe(
      '2026-10-27T08:00:00Z',
    )
  })
})

describe('inputOf', () => {
  it('is what a saved report amounts to, with null for what is missing', () => {
    expect(
      inputOf({ workDone: 'x', startedAt: undefined, finishedAt: null, labourMinutes: 5 }),
    ).toEqual({
      workDone: 'x',
      startedAt: null,
      finishedAt: null,
      labourMinutes: 5,
    })
  })
})
