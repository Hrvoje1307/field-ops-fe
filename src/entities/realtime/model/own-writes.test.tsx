import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { trackOwnWrites } from './own-writes'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('trackOwnWrites', () => {
  it('knows nothing of writes until one is made', () => {
    const client = new QueryClient()
    expect(trackOwnWrites(client, 100).recent()).toBe(false)
  })

  it('a write is recent while it runs and for a short while after, then not', async () => {
    const client = new QueryClient()
    const tracker = trackOwnWrites(client, 120)
    let finish: () => void = () => undefined
    const observer = new MutationObserver(client, {
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    })
    const pending = observer.mutate()
    expect(tracker.recent()).toBe(true)
    // Running for longer than the window: still ours
    await wait(200)
    expect(tracker.recent()).toBe(true)
    finish()
    await pending
    expect(tracker.recent()).toBe(true)
    await wait(200)
    expect(tracker.recent()).toBe(false)
  })

  it('stops watching when disposed', async () => {
    const client = new QueryClient()
    const tracker = trackOwnWrites(client, 120)
    tracker.dispose()
    await new MutationObserver(client, { mutationFn: () => Promise.resolve() }).mutate()
    expect(tracker.recent()).toBe(false)
  })
})
