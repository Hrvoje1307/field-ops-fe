import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type { JobType, JobTypeInput } from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { JOB_TYPES_STALE_TIME } from './const'

export const jobTypeKeys = {
  all: ['job-types'] as const,
}

/** Jobs show their type's name and colour, and the board its duration and crew size. */
const JOB_TYPE_ROOTS = [...JOB_DATA_ROOTS, 'job-types']

// --- GET (used as queryFn) ---------------------------------------------------

export async function listJobTypes(signal?: AbortSignal) {
  return apiFetch<JobType[]>('/job-types', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createJobType(body: JobTypeInput, idempotencyKey?: string) {
  return apiFetch<JobType>('/job-types', { method: 'POST', json: body, idempotencyKey })
}

/** Full replacement. */
export async function updateJobType(id: string, body: JobTypeInput, idempotencyKey?: string) {
  return apiFetch<JobType>(path`/job-types/${id}`, { method: 'PUT', json: body, idempotencyKey })
}

/** 409 while jobs of this type exist: deactivate it instead (`isActive: false`). */
export async function deleteJobType(id: string) {
  return apiFetch<undefined>(path`/job-types/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's job types. */
export function useListJobTypes() {
  return useQuery({
    queryKey: jobTypeKeys.all,
    queryFn: ({ signal }) => listJobTypes(signal),
    staleTime: JOB_TYPES_STALE_TIME,
  })
}

export function useCreateJobType() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: JobTypeInput) => createJobType(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, JOB_TYPE_ROOTS)
    },
  })
}

export function useUpdateJobType() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: JobTypeInput }) =>
      updateJobType(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, JOB_TYPE_ROOTS)
    },
  })
}

export function useDeleteJobType() {
  return useMutation({
    mutationFn: (id: string) => deleteJobType(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, JOB_TYPE_ROOTS),
  })
}
