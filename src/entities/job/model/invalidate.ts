import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Cached responses that contain job data. Generated keys start with the request path
 * (`['/jobs/abc']`, `['/jobs', params]`), so the first key part is matched.
 */
const JOB_DATA_PATHS = [
  /^\/jobs(\/|$)/, // lists, detail, history, report, materials…
  /^\/me\/jobs$/, // technician's day
  /^\/technicians\/[^/]+\/schedule$/,
  /^\/dispatch\/board$/,
  /^\/clients(\/[^/]+)?$/, // open job counts, client detail
  /^\/reports\//,
]

export function isJobDataKey(queryKey: QueryKey): boolean {
  const [path] = queryKey
  return typeof path === 'string' && JOB_DATA_PATHS.some((pattern) => pattern.test(path))
}

/** Refetches everything that shows job data after a job changed. */
export function invalidateJobData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (query) => isJobDataKey(query.queryKey) })
}
