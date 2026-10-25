import {
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  useMutation,
  useQuery,
} from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  AssignRequest,
  Job,
  JobCreate,
  JobStatus,
  JobSummaryPage,
  ListJobsParams,
  StatusHistoryEntry,
  TechnicianDay,
  TransitionRequest,
} from '@/shared/api/generated/model'

import { isConflict } from '@/shared/api/api-error'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, isUnderRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'
import { currentPosition } from '@/shared/lib/position'

import { JOB_DETAIL_STALE_TIME, JOB_HISTORY_STALE_TIME, JOB_LIST_STALE_TIME } from './const'
import { handleJobConflict } from './model/conflict'

export const jobKeys = {
  all: ['jobs'] as const,
  list: (params: ListJobsParams) => ['jobs', 'list', params] as const,
  detail: (id: string) => ['jobs', 'detail', id] as const,
  history: (id: string) => ['jobs', 'detail', id, 'history'] as const,
  /** The signed-in technician's day (under `jobs`, so job changes refresh it). */
  myDay: (date: string) => ['jobs', 'my-day', date] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listJobs(params: ListJobsParams, signal?: AbortSignal) {
  return apiFetch<JobSummaryPage>('/jobs', { query: params, signal })
}

export async function getJob(id: string, signal?: AbortSignal) {
  return apiFetch<Job>(path`/jobs/${id}`, { signal })
}

/** The signed-in technician's jobs on a day, in visit order. */
export async function getMyDay(date: string, signal?: AbortSignal) {
  return apiFetch<TechnicianDay>('/me/jobs', { query: { date }, signal })
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
  return isUnderRoots(queryKey, JOB_DATA_ROOTS)
}

/** Refetches everything that shows job data after a job changed. */
export function invalidateJobData(queryClient: QueryClient): Promise<void> {
  return invalidateRoots(queryClient, JOB_DATA_ROOTS)
}

// --- Hooks (what features and widgets call) ---------------------------------

interface QueryOptions {
  /** Wait (false) until what the request needs is known. */
  enabled?: boolean
}

/** One job. */
export function useGetJob(id: string, { enabled = true }: QueryOptions = {}) {
  return useQuery({
    queryKey: jobKeys.detail(id),
    queryFn: ({ signal }) => getJob(id, signal),
    staleTime: JOB_DETAIL_STALE_TIME,
    enabled,
  })
}

/** A page of jobs; with `keepPrevious` the rows stay while the next page or filter loads. */
export function useListJobs(
  params: ListJobsParams,
  { enabled = true, keepPrevious = false }: QueryOptions & { keepPrevious?: boolean } = {},
) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: ({ signal }) => listJobs(params, signal),
    staleTime: JOB_LIST_STALE_TIME,
    enabled,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

/** A job's status changes, oldest first. */
export function useGetJobHistory(id: string) {
  return useQuery({
    queryKey: jobKeys.history(id),
    queryFn: ({ signal }) => getJobHistory(id, signal),
    staleTime: JOB_HISTORY_STALE_TIME,
  })
}

/** The signed-in technician's day. */
export function useGetMyDay(date: string) {
  return useQuery({
    queryKey: jobKeys.myDay(date),
    queryFn: ({ signal }) => getMyDay(date, signal),
    staleTime: JOB_LIST_STALE_TIME,
  })
}

/** Creates a job; everything showing job data refreshes. */
export function useCreateJob() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: JobCreate) => createJob(body, idempotency.keyFor(body)),
    onSuccess: (_job, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateJobData(client)
    },
  })
}

/**
 * Replaces a job's technicians, date and start. The returned job goes into the detail
 * cache and job data refreshes. A 409 (stale version) refetches and tells the user.
 */
export function useAssignJob() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssignRequest }) =>
      assignJob(id, body, idempotency.keyFor({ id, body })),
    onSuccess: (updated, variables, _result, { client }) => {
      idempotency.forget({ id: variables.id, body: variables.body })
      client.setQueryData(jobKeys.detail(updated.id), updated)
      void invalidateJobData(client)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error) ? handleJobConflict(client) : undefined,
  })
}

/**
 * Moves a job along the status machine with its `version` (and the `note` where the
 * contract needs one). `withPosition` adds the phone's position when it arrives in time
 * (never blocks). A retry of the same change reuses its idempotency key (the position
 * isn't part of it). The returned job goes into the detail cache and job data
 * refreshes. A 409 refetches and tells the user.
 */
export function useTransitionJob() {
  const idempotency = useIdempotencyKeys()
  const requestOf = ({ job, to, note }: TransitionVariables) => ({
    id: job.id,
    to,
    note,
    version: job.version,
  })
  return useMutation({
    mutationFn: async (variables: TransitionVariables) => {
      const { job, to, note, withPosition = false } = variables
      const body: TransitionRequest = { to, version: job.version }
      if (note !== undefined) body.note = note
      const position = withPosition ? await currentPosition() : null
      if (position) {
        body.lat = position.lat
        body.lng = position.lng
      }
      return transitionJob(job.id, body, idempotency.keyFor(requestOf(variables)))
    },
    onSuccess: (updated, variables, _result, { client }) => {
      idempotency.forget(requestOf(variables))
      client.setQueryData(jobKeys.detail(updated.id), updated)
      void invalidateJobData(client)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error) ? handleJobConflict(client) : undefined,
  })
}

export interface TransitionVariables {
  job: Pick<Job, 'id' | 'version'>
  to: JobStatus
  note?: string
  /** Ask the phone for its position and send it (never waits longer than a few seconds). */
  withPosition?: boolean
}
