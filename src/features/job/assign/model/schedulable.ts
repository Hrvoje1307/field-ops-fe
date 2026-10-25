import type { Job } from '@/entities/job'

/**
 * Statuses a schedule makes sense for; the others are under way, done or cancelled
 * (the mock refuses them with 409; which statuses /assign accepts is
 * docs/backend-questions.md #29).
 */
const SCHEDULABLE: readonly Job['status'][] = ['new', 'scheduled', 'confirmed', 'on_hold']

export function canSchedule(status: Job['status']): boolean {
  return SCHEDULABLE.includes(status)
}
