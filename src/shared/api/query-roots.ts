import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Every entity's query keys start with its API area (`['jobs', 'detail', id]`). These
 * are the areas whose cached data shows jobs: job lists and pages, client pages (open
 * jobs), technician schedules, the dispatch board and reports. A change to a job, or
 * to something a job shows, refreshes all of them.
 */
export const JOB_DATA_ROOTS: readonly string[] = [
  'jobs',
  'clients',
  'technicians',
  'dispatch',
  'reports',
]

export function isUnderRoots(queryKey: QueryKey, roots: readonly string[]): boolean {
  const [root] = queryKey
  return typeof root === 'string' && roots.includes(root)
}

/** Marks everything cached under these API areas as stale; active queries refetch. */
export function invalidateRoots(queryClient: QueryClient, roots: readonly string[]): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => isUnderRoots(query.queryKey, roots),
  })
}
