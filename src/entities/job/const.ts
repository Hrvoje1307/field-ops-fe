/** Lists change often: refetched every time a list is shown. */
export const JOB_LIST_STALE_TIME = 0

/**
 * A job page shown right after the job was fetched doesn't fetch it again. Changes
 * invalidate job data whatever its age, so this never hides an edit.
 */
export const JOB_DETAIL_STALE_TIME = 5_000

/** Status history, like the detail. */
export const JOB_HISTORY_STALE_TIME = 5_000

/**
 * Query keys that show job data, by their first part (every entity's keys start with
 * its API area): job lists and pages, client pages (open jobs), technician schedules,
 * the dispatch board and reports.
 */
export const JOB_DATA_KEY_ROOTS: readonly string[] = [
  'jobs',
  'clients',
  'technicians',
  'dispatch',
  'reports',
]
