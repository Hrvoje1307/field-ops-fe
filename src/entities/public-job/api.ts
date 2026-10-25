import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { ApiError, isConflict } from '@/shared/api/api-error'
import type { PublicJob, RequestPublicRescheduleBody } from '@/shared/api/generated/model'

import { PUBLIC_JOB_STALE_TIME } from './const'

export const publicJobKeys = {
  detail: (token: string) => ['public', 'jobs', token] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** What the client's link shows. No sign-in; the token in the address is the access. */
export async function getPublicJob(token: string, signal?: AbortSignal) {
  return apiFetch<PublicJob>(path`/public/jobs/${token}`, { signal })
}

// --- POST (used as mutationFn) -----------------------------------------------

/** Idempotent. 409 when the job can no longer be confirmed. */
export async function confirmPublicJob(token: string) {
  return apiFetch<PublicJob>(path`/public/jobs/${token}/confirm`, { method: 'POST' })
}

export async function requestPublicReschedule(token: string, body: RequestPublicRescheduleBody) {
  return apiFetch<PublicJob>(path`/public/jobs/${token}/reschedule-request`, {
    method: 'POST',
    json: body,
  })
}

/** What is wrong with a link: it does not exist (404) or has run out (410). */
export function linkProblem(error: unknown): 'not_found' | 'gone' | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 404) return 'not_found'
  if (error.status === 410) return 'gone'
  return null
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useGetPublicJob(token: string) {
  return useQuery({
    queryKey: publicJobKeys.detail(token),
    queryFn: ({ signal }) => getPublicJob(token, signal),
    staleTime: PUBLIC_JOB_STALE_TIME,
  })
}

/** The page shows what the API returns afterwards; a 409 shows the job as it is now. */
export function useConfirmPublicJob(token: string) {
  return useMutation({
    mutationFn: () => confirmPublicJob(token),
    onSuccess: (job, _variables, _result, { client }) => {
      client.setQueryData(publicJobKeys.detail(token), job)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error)
        ? client.invalidateQueries({ queryKey: publicJobKeys.detail(token) })
        : undefined,
  })
}

export function useRequestPublicReschedule(token: string) {
  return useMutation({
    mutationFn: (body: RequestPublicRescheduleBody) => requestPublicReschedule(token, body),
    onSuccess: (job, _body, _result, { client }) => {
      client.setQueryData(publicJobKeys.detail(token), job)
    },
  })
}
