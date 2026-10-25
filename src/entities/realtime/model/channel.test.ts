import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChannel, type LiveEvent } from './channel'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T08:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('channel', () => {
  it('starts disconnected, says when the status changes, and not when it does not', () => {
    const channel = createChannel()
    const listener = vi.fn()
    channel.subscribeStatus(listener)
    expect(channel.getStatus()).toBe('disconnected')
    channel.setStatus('connecting')
    channel.setStatus('connecting')
    expect(listener).toHaveBeenCalledTimes(1)
    channel.setStatus('connected')
    expect(channel.getStatus()).toBe('connected')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('knows since when the connection has been down, from the first moment it was', () => {
    const channel = createChannel()
    const start = Date.now()
    expect(channel.getDownSince()).toBe(start)
    vi.advanceTimersByTime(5000)
    channel.setStatus('connecting')
    channel.setStatus('reconnecting')
    expect(channel.getDownSince()).toBe(start)
    channel.setStatus('connected')
    expect(channel.getDownSince()).toBeNull()
    vi.advanceTimersByTime(1000)
    channel.setStatus('disconnected')
    expect(channel.getDownSince()).toBe(start + 6000)
  })

  it('hands events to whoever listens, until they stop', () => {
    const channel = createChannel()
    const heard: LiveEvent[] = []
    const stop = channel.subscribeEvents((event) => heard.push(event))
    const event: LiveEvent = {
      type: 'JobUpdated',
      payload: { jobId: 'a', scheduledDate: null },
      own: false,
    }
    channel.publish(event)
    stop()
    channel.publish(event)
    expect(heard).toEqual([event])
  })
})
