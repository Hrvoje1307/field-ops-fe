import type { LiveEvent } from '@/entities/realtime'

/**
 * What a technician is told about a change the office made: a published plan names its
 * day, anything else about a job is "the schedule changed". Null for changes of their
 * own, which they already see.
 */
export function noticeFor(
  event: LiveEvent,
): { key: 'live.planPublished'; date: string } | { key: 'live.scheduleChanged' } | null {
  if (event.own) return null
  if (event.type === 'RoutePlanPublished') {
    return { key: 'live.planPublished', date: event.payload.date }
  }
  return { key: 'live.scheduleChanged' }
}
