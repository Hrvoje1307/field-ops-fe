import { apiFetch } from '@/shared/api/api-fetch'
import type { JobType } from '@/shared/api/generated/model'

export const jobTypeKeys = {
  all: ['job-types'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function listJobTypes(signal?: AbortSignal) {
  return apiFetch<JobType[]>('/job-types', { signal })
}
