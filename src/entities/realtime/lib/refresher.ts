import type { QueryClient } from '@tanstack/react-query'

import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { REFRESH_COALESCE_MS } from '../const'

export interface Refresher {
  /** Something changed on the server (an event, or a connection that was lost and is back). */
  push: () => void
  dispose: () => void
}

/**
 * Marks job data stale when the hub says something changed; what is on screen refetches.
 * Events are thin and a job's date is only where it is now, not where it was, so every
 * area that shows jobs is refreshed (the ones not on screen are only marked). A burst of
 * events, or our own write echoing back, refreshes once.
 */
export function createRefresher(
  queryClient: QueryClient,
  delay: number = REFRESH_COALESCE_MS,
): Refresher {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    push: () => {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        void invalidateRoots(queryClient, JOB_DATA_ROOTS)
      }, delay)
    },
    dispose: () => {
      clearTimeout(timer)
      timer = undefined
    },
  }
}
