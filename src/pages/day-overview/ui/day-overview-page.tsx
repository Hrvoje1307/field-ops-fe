import { useTenantFormat } from '@/shared/lib/tenant-format'
import { DayOverview } from '@/widgets/day-overview'

/** The office home: the day's schedule (today unless another date is in the URL). */
export function DayOverviewPage({
  date,
  onDateChange,
}: {
  date?: string
  onDateChange: (date: string) => void
}) {
  const { today } = useTenantFormat()
  return <DayOverview date={date ?? today()} onDateChange={onDateChange} />
}
