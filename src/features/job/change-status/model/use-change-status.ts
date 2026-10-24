import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'

import {
  invalidateJobData,
  type Job,
  jobKeys,
  type JobStatus,
  transitionJob,
  type TransitionRequest,
} from '@/entities/job'
import { ApiError } from '@/shared/api/api-error'
import { useIdempotencyKeys } from '@/shared/api/idempotency'

export interface ChangeStatusVariables {
  job: Pick<Job, 'id' | 'version'>
  to: JobStatus
  note?: string
}

/**
 * `POST /jobs/{id}/transition` with the job's `version`. On success the returned job
 * goes straight into the detail cache and everything showing job data refetches.
 * Errors are left to the caller (409 → `handleJobConflict`).
 */
export function useChangeStatus() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKeys()

  const requestOf = ({ job, to, note }: ChangeStatusVariables) => {
    const body: TransitionRequest = { to, version: job.version }
    if (note !== undefined) body.note = note
    return { id: job.id, body }
  }

  return useMutation({
    mutationFn: (variables: ChangeStatusVariables) => {
      const request = requestOf(variables)
      return transitionJob(request.id, request.body, idempotency.keyFor(request))
    },
    onSuccess: (updated, variables) => {
      idempotency.forget(requestOf(variables))
      queryClient.setQueryData(jobKeys.detail(updated.id), updated)
      void invalidateJobData(queryClient)
    },
  })
}

/** Toast text for a failed change other than 409 (which refetches instead). */
export function changeStatusErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 403) return t('job.changeStatus.forbidden')
  return t('job.changeStatus.failed')
}
