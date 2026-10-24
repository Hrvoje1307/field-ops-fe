import { queryOptions } from '@tanstack/react-query'

import { getGetMyJobsQueryKey, getMyJobs } from '@/shared/api/generated/field/field'
import {
  getGetJobHistoryQueryKey,
  getGetJobQueryKey,
  getJob,
  getJobHistory,
  getListJobsQueryKey,
  listJobs,
} from '@/shared/api/generated/jobs/jobs'
import type { GetMyJobsParams, ListJobsParams } from '@/shared/api/generated/model'

/**
 * A job page opened right after its route loader fetched doesn't fetch again. Changes
 * invalidate these queries, which refetches them whatever their age.
 */
const DETAIL_STALE_MS = 5_000

/** Query options for jobs; keys come from the generated client so its hooks share the cache. */
export const jobQueries = {
  list: (params?: ListJobsParams) =>
    queryOptions({
      queryKey: getListJobsQueryKey(params),
      queryFn: ({ signal }) => listJobs(params, { signal }),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: getGetJobQueryKey(id),
      queryFn: ({ signal }) => getJob(id, { signal }),
      staleTime: DETAIL_STALE_MS,
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: getGetJobHistoryQueryKey(id),
      queryFn: ({ signal }) => getJobHistory(id, { signal }),
      staleTime: DETAIL_STALE_MS,
    }),
  /** The signed-in technician's day. */
  myDay: (params: GetMyJobsParams) =>
    queryOptions({
      queryKey: getGetMyJobsQueryKey(params),
      queryFn: ({ signal }) => getMyJobs(params, { signal }),
    }),
}
