import { createFileRoute } from '@tanstack/react-router'

import { DayOverviewPage } from '@/pages/day-overview'

export const Route = createFileRoute('/_authed/_office/')({
  component: DayOverviewPage,
})
