import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { jobQueries } from '@/entities/job'
import { ApiError } from '@/shared/api/api-error'

/**
 * Route loader: the job before the page renders (404 → not found), its history in the
 * background. Other errors are left to the page, which shows them with a retry.
 */
export async function loadJob(queryClient: QueryClient, jobId: string): Promise<void> {
  void queryClient.query(jobQueries.history(jobId)).catch(() => undefined)
  try {
    await queryClient.query(jobQueries.detail(jobId))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw notFound()
  }
}
