import { describe, expect, it } from 'vitest'

import { DRAFT_POLL_MAX_MS, DRAFT_POLL_MS, DRAFT_POLL_SLOW_MS } from '../const'
import { draftPollInterval } from './poll'

const created = '2026-10-28T09:00:00Z'
const at = (ms: number) => Date.parse(created) + ms

describe('draftPollInterval', () => {
  it('does not poll a draft that is not being written', () => {
    for (const status of ['ready', 'edited', 'failed', 'sent'] as const) {
      expect(draftPollInterval({ status, createdAt: created }, false, at(1000))).toBe(false)
    }
    expect(draftPollInterval(undefined, false)).toBe(false)
  })
  it('polls a generating draft quickly without the hub and slowly with it', () => {
    const draft = { status: 'generating', createdAt: created } as const
    expect(draftPollInterval(draft, false, at(1000))).toBe(DRAFT_POLL_MS)
    expect(draftPollInterval(draft, true, at(1000))).toBe(DRAFT_POLL_SLOW_MS)
    expect(DRAFT_POLL_SLOW_MS).toBeGreaterThan(DRAFT_POLL_MS)
  })
  it('gives up after the limit, hub or not', () => {
    const draft = { status: 'generating', createdAt: created } as const
    expect(draftPollInterval(draft, true, at(DRAFT_POLL_MAX_MS + 1))).toBe(false)
    expect(draftPollInterval(draft, false, at(DRAFT_POLL_MAX_MS + 1))).toBe(false)
  })
})
