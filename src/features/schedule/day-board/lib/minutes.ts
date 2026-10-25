import { minutesOf } from '@/entities/technician'

/** Minutes from one `HH:mm` to another (0 if the end isn't later). */
export function minutesBetween(start: string, end: string): number {
  return Math.max(0, minutesOf(end) - minutesOf(start))
}
