import {
  addDays,
  dateInTimeZone,
  zonedDateTimeToInstant,
  timeInTimeZone,
} from '@/shared/lib/datetime'

import { isoWeekday } from '../visit-order'

/**
 * The instant `days` business days (Mon–Fri) after `from`, at the same local time, in the
 * tenant's zone. Follow-up rules count business days after our last outbound message
 * (spec: FollowUpRuleInput.daysWithoutReply).
 */
export function addBusinessDays(from: string, days: number, timeZone: string): string {
  let date = dateInTimeZone(from, timeZone)
  let left = days
  while (left > 0) {
    date = addDays(date, 1)
    if (isoWeekday(date) <= 5) left -= 1
  }
  return zonedDateTimeToInstant(date, timeInTimeZone(from, timeZone), timeZone)
}
