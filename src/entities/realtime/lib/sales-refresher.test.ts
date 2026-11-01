import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSalesRefresher } from './sales-refresher'

let queryClient: QueryClient

beforeEach(() => {
  vi.useFakeTimers()
  queryClient = new QueryClient()
  for (const key of [
    ['mail-threads', 'list', {}],
    ['mail-threads', 'detail', 't1'],
    ['mail-threads', 'detail', 't2'],
    ['deals', 'board', {}],
    ['deals', 'today', {}],
    ['deals', 'list', {}],
    ['deals', 'detail', 'd1'],
    ['deals', 'detail', 'd1', 'activities'],
    ['deals', 'detail', 'd2'],
    ['drafts', 'list', {}],
    ['drafts', 'detail', 'x1'],
    ['drafts', 'detail', 'x2'],
    ['mailboxes', 'list'],
    ['sales-stages', 'list'],
    ['jobs', 'list'],
  ]) {
    queryClient.setQueryData(key, [])
  }
})

afterEach(() => {
  vi.useRealTimers()
})

const stale = (key: unknown[]) => queryClient.getQueryState(key)?.isInvalidated ?? false
const staleKeys = () =>
  queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.isInvalidated)
    .map((q) => JSON.stringify(q.queryKey))

describe('createSalesRefresher', () => {
  it('a thread event marks that thread, its deal, the lists and the mailboxes, not other threads or deals', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({ type: 'SalesThreadUpdated', payload: { threadId: 't1', dealId: 'd1' } })
    vi.advanceTimersByTime(10)
    expect(stale(['mail-threads', 'detail', 't1'])).toBe(true)
    expect(stale(['mail-threads', 'detail', 't2'])).toBe(false)
    expect(stale(['mail-threads', 'list', {}])).toBe(true)
    expect(stale(['deals', 'detail', 'd1'])).toBe(true)
    expect(stale(['deals', 'detail', 'd1', 'activities'])).toBe(true)
    expect(stale(['deals', 'detail', 'd2'])).toBe(false)
    expect(stale(['deals', 'board', {}])).toBe(true)
    expect(stale(['deals', 'today', {}])).toBe(true)
    expect(stale(['mailboxes', 'list'])).toBe(true)
    expect(stale(['jobs', 'list'])).toBe(false)
    expect(stale(['sales-stages', 'list'])).toBe(false)
  })

  it('a deal event marks that deal, the funnel, Today and the lists', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({ type: 'DealUpdated', payload: { dealId: 'd2' } })
    vi.advanceTimersByTime(10)
    expect(stale(['deals', 'detail', 'd2'])).toBe(true)
    expect(stale(['deals', 'detail', 'd1'])).toBe(false)
    expect(stale(['deals', 'board', {}])).toBe(true)
    expect(stale(['deals', 'today', {}])).toBe(true)
    expect(stale(['mail-threads', 'detail', 't1'])).toBe(false)
    expect(stale(['mailboxes', 'list'])).toBe(false)
  })

  it('a draft event marks that draft, its thread, the lists and Today', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({
      type: 'DraftReady',
      payload: { draftId: 'x2', threadId: 't2', status: 'ready' },
    })
    vi.advanceTimersByTime(10)
    expect(stale(['drafts', 'detail', 'x2'])).toBe(true)
    expect(stale(['drafts', 'detail', 'x1'])).toBe(false)
    expect(stale(['mail-threads', 'detail', 't2'])).toBe(true)
    expect(stale(['mail-threads', 'detail', 't1'])).toBe(false)
    expect(stale(['deals', 'today', {}])).toBe(true)
    expect(stale(['drafts', 'list', {}])).toBe(true)
  })

  it('a burst refreshes once, with everything named in it', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({ type: 'DealUpdated', payload: { dealId: 'd1' } })
    refresher.handle({ type: 'DealUpdated', payload: { dealId: 'd2' } })
    expect(staleKeys()).toEqual([])
    vi.advanceTimersByTime(10)
    expect(stale(['deals', 'detail', 'd1'])).toBe(true)
    expect(stale(['deals', 'detail', 'd2'])).toBe(true)
  })

  it('job events are not its business', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({ type: 'JobUpdated', payload: { jobId: 'j1' } as never })
    vi.advanceTimersByTime(50)
    expect(staleKeys()).toEqual([])
  })

  it('after a lost connection all sales data is stale, nothing else', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.all()
    expect(stale(['mail-threads', 'detail', 't2'])).toBe(true)
    expect(stale(['deals', 'detail', 'd2'])).toBe(true)
    expect(stale(['drafts', 'detail', 'x1'])).toBe(true)
    expect(stale(['mailboxes', 'list'])).toBe(true)
    expect(stale(['sales-stages', 'list'])).toBe(true)
    expect(stale(['jobs', 'list'])).toBe(false)
  })

  it('dispose drops what has not been flushed', () => {
    const refresher = createSalesRefresher(queryClient, 10)
    refresher.handle({ type: 'DealUpdated', payload: { dealId: 'd1' } })
    refresher.dispose()
    vi.advanceTimersByTime(50)
    expect(staleKeys()).toEqual([])
  })
})
