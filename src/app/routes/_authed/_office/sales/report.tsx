import { createFileRoute } from '@tanstack/react-router'

import { reportSearchSchema } from '@/features/sales/report'
import { SalesReportPage } from '@/pages/sales-report'

export const Route = createFileRoute('/_authed/_office/sales/report')({
  validateSearch: reportSearchSchema,
  component: ReportRoute,
})

function ReportRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SalesReportPage
      search={search}
      onSearchChange={(patch) => {
        void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true })
      }}
    />
  )
}
