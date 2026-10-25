import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { JobType } from '@/shared/api/generated/model'

import { JOB_TYPES_STALE_TIME } from './const'

export const jobTypeKeys = {
  all: ['job-types'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listJobTypes(signal?: AbortSignal) {
  return apiFetch<JobType[]>('/job-types', { signal })
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
