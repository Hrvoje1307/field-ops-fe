import { describe, expect, it } from 'vitest'

import { eventsBetween, type TenantSnapshot } from './realtime-events'

const job = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over })
const base = () => ({
  status: 'new',
  scheduledDate: null as string | null,
  scheduledStart: null as string | null,
  locked: false,
  version: 1,
  deleted: false,
  technicianIds: [] as string[],
})

const snapshot = (
  jobs: Record<string, ReturnType<typeof base>> = {},
  plans: Record<string, { status: string; date: string }> = {},
): TenantSnapshot => ({
  jobs: new Map(Object.entries(jobs)),
  plans: new Map(Object.entries(plans)),
})

const NOW = '2026-10-15T08:00:00.000Z'

describe('eventsBetween', () => {
  it('says nothing when nothing changed', () => {
    const same = snapshot({ a: job() }, { p: { status: 'draft', date: '2026-10-16' } })
    expect(
      eventsBetween(
        same,
        snapshot({ a: job() }, { p: { status: 'draft', date: '2026-10-16' } }),
        NOW,
      ),
    ).toEqual([])
  })

  it('a job that changed is JobUpdated with its date, for the people on it', () => {
    const messages = eventsBetween(
      snapshot({ a: job({ technicianIds: ['t1'] }) }),
      snapshot({ a: job({ version: 2, scheduledDate: '2026-10-16', technicianIds: ['t2'] }) }),
      NOW,
    )
    expect(messages).toEqual([
      {
        target: 'JobUpdated',
        payload: { jobId: 'a', scheduledDate: '2026-10-16' },
        technicianIds: ['t1', 't2'],
      },
    ])
  })

  it('a change of status is also JobStatusChanged, with the lead technician', () => {
    const messages = eventsBetween(
      snapshot({ a: job({ status: 'scheduled', technicianIds: ['t1', 't2'] }) }),
      snapshot({ a: job({ status: 'en_route', version: 2, technicianIds: ['t1', 't2'] }) }),
      NOW,
    )
    expect(messages.map((m) => m.target)).toEqual(['JobUpdated', 'JobStatusChanged'])
    expect(messages[1]).toMatchObject({
      payload: {
        jobId: 'a',
        from: 'scheduled',
        to: 'en_route',
        technicianId: 't1',
        changedAt: NOW,
      },
      technicianIds: ['t1', 't2'],
    })
  })

  it('a new job is JobUpdated only, and a deleted one is still told', () => {
    expect(eventsBetween(snapshot(), snapshot({ a: job() }), NOW).map((m) => m.target)).toEqual([
      'JobUpdated',
    ])
    expect(
      eventsBetween(snapshot({ a: job() }), snapshot({ a: job({ deleted: true }) }), NOW).map(
        (m) => m.target,
      ),
    ).toEqual(['JobUpdated'])
    // Already gone before: nothing to tell
    expect(eventsBetween(snapshot(), snapshot({ a: job({ deleted: true }) }), NOW)).toEqual([])
  })

  it('only a change that people see counts: start, lock, technicians', () => {
    for (const change of [
      { scheduledStart: '2026-10-16T08:00:00Z' },
      { locked: true },
      { technicianIds: ['t1'] },
    ]) {
      expect(
        eventsBetween(snapshot({ a: job() }), snapshot({ a: job(change) }), NOW),
        JSON.stringify(change),
      ).toHaveLength(1)
    }
  })

  it('a plan that becomes published is told to everyone; one that stays so, or is a draft, is not', () => {
    const published = { status: 'published', date: '2026-10-16' }
    const draft = { status: 'draft', date: '2026-10-16' }
    expect(eventsBetween(snapshot({}, { p: draft }), snapshot({}, { p: published }), NOW)).toEqual([
      {
        target: 'RoutePlanPublished',
        payload: { routePlanId: 'p', date: '2026-10-16' },
        technicianIds: 'all',
      },
    ])
    expect(
      eventsBetween(snapshot({}, { p: published }), snapshot({}, { p: published }), NOW),
    ).toEqual([])
    expect(eventsBetween(snapshot(), snapshot({}, { p: draft }), NOW)).toEqual([])
  })
})
