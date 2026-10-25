import { FieldDay } from '@/features/field/day'
import { useTenantFormat } from '@/shared/lib/tenant-format'

/** The technician's home: their day (today unless another date is in the URL). */
export function FieldDayPage({
  date,
  onDateChange,
}: {
  date?: string
  onDateChange: (date: string) => void
}) {
  const { today } = useTenantFormat()
  return <FieldDay date={date ?? today()} onDateChange={onDateChange} />
}
