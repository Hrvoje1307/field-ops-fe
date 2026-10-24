import type { JobStatus } from '@/shared/api/generated/model'

/**
 * Target statuses that need a note. From the contract: `TransitionRequest.note` is
 * "Required for cancelled and on_hold". Which transitions exist comes from
 * `Job.allowedTransitions`, never from the client.
 */
export const NOTE_REQUIRED_STATUSES: readonly JobStatus[] = ['cancelled', 'on_hold']

export function transitionNeedsNote(to: JobStatus): boolean {
  return NOTE_REQUIRED_STATUSES.includes(to)
}
