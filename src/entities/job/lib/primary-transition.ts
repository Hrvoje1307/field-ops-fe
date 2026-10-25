import type { JobStatus } from '@/shared/api/generated/model'

import { TRACK_STATUSES } from '../model/status-track'

/** Status changes a person doing the work must not do from a screen of their own. */
const NOT_OFFERED: readonly JobStatus[] = ['completed']

/**
 * Splits `Job.allowedTransitions` for a screen with one big button: the primary change
 * is the nearest step forward along the usual path (`TRACK_STATUSES`); everything else
 * goes under "more". Display order only: what is allowed comes from the API.
 * `completed` is left out (it goes through `/complete` with the report).
 */
export function splitTransitions(
  status: JobStatus,
  allowedTransitions: readonly JobStatus[],
): { primary: JobStatus | null; more: JobStatus[] } {
  const offered = allowedTransitions.filter((to) => !NOT_OFFERED.includes(to))
  const track = TRACK_STATUSES as readonly JobStatus[]
  const here = track.indexOf(status)
  const forward = offered
    .filter((to) => track.indexOf(to) > here && here >= 0)
    .sort((a, b) => track.indexOf(a) - track.indexOf(b))
  const primary = forward[0] ?? null
  return { primary, more: offered.filter((to) => to !== primary) }
}
