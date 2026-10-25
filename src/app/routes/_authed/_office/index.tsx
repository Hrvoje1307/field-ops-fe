import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { DayOverviewPage } from '@/pages/day-overview'
import { isPlainDate } from '@/shared/lib/datetime'

const searchSchema = z.object({
  /** Tenant-local day; today when absent. */
  date: z.string().refine(isPlainDate).optional().catch(undefined),
})

export const Route = createFileRoute('/_authed/_office/')({
  validateSearch: searchSchema,
  component: DayOverviewRoute,
})

function DayOverviewRoute() {
  const { date } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <DayOverviewPage
      date={date}
      onDateChange={(next) => {
        void navigate({ search: { date: next } })
      }}
    />
  )
}
