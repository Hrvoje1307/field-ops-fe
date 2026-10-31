import { afterEach, beforeEach, vi } from 'vitest'

/** A Wednesday: the seed and some screens skip weekends, so a run on a Saturday saw another calendar. */
export const FIXED_NOW = new Date('2026-10-28T09:00:00Z')

/**
 * Fixes "today" for the tests of one file. Only `Date` is mocked; timers stay real.
 * Call it at the top of the file, so it runs before the file's own `beforeEach`.
 */
export function fixToday(now: Date = FIXED_NOW): void {
  beforeEach(() => {
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
