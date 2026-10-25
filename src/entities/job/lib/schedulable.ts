import type { JobStatus } from '@/shared/api/generated/model'

/**
 * Statuses a schedule makes sense for; the others are under way, done or cancelled
 * (the mock refuses them with 409; which statuses /assign accepts is
 * docs/backend-questions.md #29).
 */
const SCHEDULABLE: readonly JobStatus[] = ['new', 'scheduled', 'confirmed', 'on_hold']

export function canSchedule(status: JobStatus): boolean {
  return SCHEDULABLE.includes(status)
}
