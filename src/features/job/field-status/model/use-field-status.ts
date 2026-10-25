import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  invalidateJobData,
  type Job,
  jobKeys,
  type JobStatus,
  transitionJob,
  type TransitionRequest,
} from '@/entities/job'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { currentPosition } from '@/shared/lib/position'

export interface FieldStatusVariables {
  job: Pick<Job, 'id' | 'version'>
  to: JobStatus
  note?: string
  /** Ask the phone for its position and send it (never waits longer than a few seconds). */
  withPosition: boolean
}

/**
 * `POST /jobs/{id}/transition` from the phone, with the job's `version`, the note when
 * there is one and, for the arrival steps, the phone's position (`lat`/`lng`, which the
 * history records). No position never stops the change. A retry of the same change
 * reuses its idempotency key.
 */
export function useFieldStatus() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKeys()
  const keyOf = ({ job, to, note }: FieldStatusVariables) => ({
    id: job.id,
    to,
    note,
    version: job.version,
  })

  return useMutation({
    mutationFn: async (variables: FieldStatusVariables) => {
      const { job, to, note, withPosition } = variables
      const body: TransitionRequest = { to, version: job.version }
      if (note !== undefined) body.note = note
      if (withPosition) {
        const position = await currentPosition()
        if (position) {
          body.lat = position.lat
          body.lng = position.lng
        }
      }
      return transitionJob(job.id, body, idempotency.keyFor(keyOf(variables)))
    },
    onSuccess: (updated, variables) => {
      idempotency.forget(keyOf(variables))
      queryClient.setQueryData(jobKeys.detail(updated.id), updated)
      void invalidateJobData(queryClient)
    },
  })
}
