import type { QueryClient } from '@tanstack/react-query'

import { OWN_WRITE_WINDOW_MS } from '../const'

/**
 * Notices this tab's own writes, so an event that follows one can be told from a change
 * made by someone else: the hub sends the author's connection the event too.
 */
export function trackOwnWrites(queryClient: QueryClient, window: number = OWN_WRITE_WINDOW_MS) {
  let lastWrite = Number.NEGATIVE_INFINITY
  const cache = queryClient.getMutationCache()
  const stop = cache.subscribe((event) => {
    if (event.type !== 'updated') return
    const status = event.mutation.state.status
    if (status === 'pending' || status === 'success') lastWrite = Date.now()
  })
  return {
    /** Whether a write is running or has just finished. */
    recent: () => queryClient.isMutating() > 0 || Date.now() - lastWrite < window,
    dispose: stop,
  }
}
