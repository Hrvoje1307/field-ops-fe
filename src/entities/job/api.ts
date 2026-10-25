import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  AssignRequest,
  Job,
  JobCreate,
  JobSummaryPage,
  ListJobsParams,
  StatusHistoryEntry,
  TransitionRequest,
} from '@/shared/api/generated/model'

import { JOB_DATA_KEY_ROOTS } from './const'

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params: ListJobsParams) => ['jobs', 'list', params] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  history: (id: string) => ['jobs', 'detail', id, 'history'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listJobs(params: ListJobsParams, signal?: AbortSignal) {
  return apiFetch<JobSummaryPage>('/jobs', { query: params, signal })
}

export async function getJob(id: string, signal?: AbortSignal) {
  return apiFetch<Job>(path`/jobs/${id}`, { signal })
}

/** Oldest first. */
export async function getJobHistory(id: string, signal?: AbortSignal) {
  return apiFetch<StatusHistoryEntry[]>(path`/jobs/${id}/history`, { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** Status starts as `new`; duration and crew size default to the job type's. */
export async function createJob(body: JobCreate, idempotencyKey?: string) {
  return apiFetch<Job>('/jobs', { method: 'POST', json: body, idempotencyKey })
}

/**
 * Replaces the job's technicians, date and start. With a date a `new` job becomes
 * `scheduled`; no technicians puts a scheduled job back to `new`.
 */
export async function assignJob(id: string, body: AssignRequest, idempotencyKey?: string) {
  return apiFetch<Job>(path`/jobs/${id}/assign`, { method: 'POST', json: body, idempotencyKey })
}

/** Moves the job along the status machine. `completed` goes through `/complete`. */
export async function transitionJob(id: string, body: TransitionRequest, idempotencyKey?: string) {
  return apiFetch<Job>(path`/jobs/${id}/transition`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Cache -------------------------------------------------------------------

export function isJobDataKey(queryKey: QueryKey): boolean {
  const [root] = queryKey
  return typeof root === 'string' && JOB_DATA_KEY_ROOTS.includes(root)
}

/** Refetches everything that shows job data after a job changed. */
export function invalidateJobData(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ predicate: (query) => isJobDataKey(query.queryKey) })
}
