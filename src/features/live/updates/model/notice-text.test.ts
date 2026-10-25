import { describe, expect, it } from 'vitest'

import type { LiveEvent } from '@/entities/realtime'

import { noticeFor } from './notice-text'

const updated: LiveEvent = {
  type: 'JobUpdated',
  payload: { jobId: 'a', scheduledDate: '2026-10-16' },
  own: false,
}

describe('noticeFor', () => {
  it('a change by someone else is "the schedule changed"', () => {
    expect(noticeFor(updated)).toEqual({ key: 'live.scheduleChanged' })
    expect(
      noticeFor({
        type: 'JobStatusChanged',
        payload: { jobId: 'a', from: 'new', to: 'scheduled', changedAt: '2026-10-15T08:00:00Z' },
        own: false,
      }),
    ).toEqual({ key: 'live.scheduleChanged' })
  })

  it('a published plan names its day', () => {
    expect(
      noticeFor({
        type: 'RoutePlanPublished',
        payload: { routePlanId: 'p', date: '2026-10-16' },
        own: false,
      }),
    ).toEqual({ key: 'live.planPublished', date: '2026-10-16' })
  })

  it('what the user did themselves is not announced', () => {
    expect(noticeFor({ ...updated, own: true })).toBeNull()
  })
})
