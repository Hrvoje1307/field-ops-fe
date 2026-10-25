import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRefresher } from './refresher'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const client = new QueryClient()
  for (const key of [
    ['jobs', 'list'],
    ['clients', 'detail', 'x'],
    ['dispatch', 'board', 'd'],
    ['technicians', 'list'],
    ['reports', 'job', 'j'],
    ['skills'],
    ['tenant'],
  ]) {
    client.setQueryData(key, [])
  }
  const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated ?? false
  return { client, stale }
}

describe('createRefresher', () => {
  it('marks every area that shows jobs stale, and nothing else', () => {
    const { client, stale } = setup()
    const refresher = createRefresher(client, 200)
    refresher.push()
    vi.advanceTimersByTime(200)
    expect(
      [
        ['jobs', 'list'],
        ['clients', 'detail', 'x'],
        ['dispatch', 'board', 'd'],
        ['technicians', 'list'],
        ['reports', 'job', 'j'],
      ].map(stale),
    ).toEqual([true, true, true, true, true])
    expect([['skills'], ['tenant']].map(stale)).toEqual([false, false])
  })

  it('waits a moment, and a burst of events refreshes once', () => {
    const { client } = setup()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const refresher = createRefresher(client, 200)
    refresher.push()
    vi.advanceTimersByTime(100)
    expect(spy).not.toHaveBeenCalled()
    refresher.push()
    refresher.push()
    vi.advanceTimersByTime(100)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(1)
    // …and the next event, later, again
    refresher.push()
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does nothing once disposed', () => {
    const { client } = setup()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const refresher = createRefresher(client, 200)
    refresher.push()
    refresher.dispose()
    vi.advanceTimersByTime(1000)
    expect(spy).not.toHaveBeenCalled()
  })
})
