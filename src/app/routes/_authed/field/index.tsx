import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { FieldDayPage } from '@/pages/field-day'
import { isPlainDate } from '@/shared/lib/datetime'

const searchSchema = z.object({
  /** Tenant-local day; today when absent. */
  date: z.string().refine(isPlainDate).optional().catch(undefined),
})

export const Route = createFileRoute('/_authed/field/')({
  validateSearch: searchSchema,
  component: FieldDayRoute,
})

function FieldDayRoute() {
  const { date } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <FieldDayPage
      date={date}
      onDateChange={(next) => {
        void navigate({ search: { date: next } })
      }}
    />
  )
}
