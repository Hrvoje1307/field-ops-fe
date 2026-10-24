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
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: getGetJobHistoryQueryKey(id),
      queryFn: ({ signal }) => getJobHistory(id, { signal }),
    }),
  /** The signed-in technician's day. */
  myDay: (params: GetMyJobsParams) =>
    queryOptions({
      queryKey: getGetMyJobsQueryKey(params),
      queryFn: ({ signal }) => getMyJobs(params, { signal }),
    }),
}
