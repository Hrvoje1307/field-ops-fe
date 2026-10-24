import { describe, expect, it } from 'vitest'

import type { JobStatus, StatusHistoryEntry } from '@/shared/api/generated/model'

import { trackSteps } from './status-track'

/** History entries one hour apart, oldest first. */
function history(...statuses: JobStatus[]): StatusHistoryEntry[] {
  return statuses.map((toStatus, index) => ({
    id: `h${String(index)}`,
    fromStatus: index === 0 ? null : (statuses[index - 1] ?? null),
    toStatus,
    actor: 'user',
    changedAt: `2026-10-20T${String(8 + index).padStart(2, '0')}:00:00Z`,
  }))
}

const states = (status: JobStatus, entries?: StatusHistoryEntry[]) =>
  Object.fromEntries(trackSteps(status, entries).steps.map((step) => [step.status, step.state]))

describe('trackSteps', () => {
  it('marks reached steps done, the status current and the rest upcoming', () => {
    const model = trackSteps('en_route', history('new', 'scheduled', 'confirmed', 'en_route'))
    expect(model.steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(model.steps[3]?.at).toBe('2026-10-20T11:00:00Z')
    expect(model.steps[0]?.at).toBe('2026-10-20T08:00:00Z')
    expect(model.offTrack).toBeNull()
  })

  it('shows a step the job went past as skipped', () => {
    expect(states('on_site', history('new', 'scheduled', 'en_route', 'on_site'))).toMatchObject({
      scheduled: 'done',
      confirmed: 'skipped',
      en_route: 'done',
      on_site: 'current',
    })
  })

  it('without history yet, counts the steps before the status as done', () => {
    const model = trackSteps('confirmed')
    expect(model.steps.slice(0, 3).map((step) => [step.state, step.at])).toEqual([
      ['done', null],
      ['done', null],
      ['current', null],
    ])
  })

  it('on hold: stops at the last step reached and reports the off-track status', () => {
    const model = trackSteps(
      'on_hold',
      history('new', 'scheduled', 'en_route', 'on_site', 'on_hold'),
    )
    expect(model.steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'skipped',
      'done',
      'done',
      'upcoming',
      'upcoming',
    ])
    expect(model.offTrack).toEqual({ status: 'on_hold', at: '2026-10-20T12:00:00Z' })
  })

  it('cancelled from new: only new is done', () => {
    const model = trackSteps('cancelled', history('new', 'cancelled'))
    expect(model.steps.filter((step) => step.state === 'done').map((step) => step.status)).toEqual([
      'new',
    ])
    expect(model.offTrack?.status).toBe('cancelled')
  })

  it('counts only history since the job last went back to new', () => {
    // Confirmed the first time; reopened after completion and sent out again without it
    const entries = history(
      'new',
      'scheduled',
      'confirmed',
      'en_route',
      'on_site',
      'completed',
      'new',
      'scheduled',
      'en_route',
    )
    expect(states('en_route', entries)).toMatchObject({
      new: 'done',
      scheduled: 'done',
      confirmed: 'skipped',
      en_route: 'current',
      completed: 'upcoming',
    })
    const steps = trackSteps('en_route', entries).steps
    expect(steps[0]?.at).toBe('2026-10-20T14:00:00Z')
    expect(steps[2]?.at).toBeNull()
  })

  it('moving back along the path (en route → scheduled) makes later steps upcoming again', () => {
    const entries = history('new', 'scheduled', 'en_route', 'scheduled')
    expect(states('scheduled', entries)).toMatchObject({
      scheduled: 'current',
      en_route: 'upcoming',
    })
  })

  it('sorts history by time whatever the order it arrives in', () => {
    const entries = history('new', 'scheduled').reverse()
    expect(states('scheduled', entries)).toMatchObject({ new: 'done', scheduled: 'current' })
  })
})
