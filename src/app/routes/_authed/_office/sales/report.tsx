import { createFileRoute } from '@tanstack/react-router'

import { SalesReportPage } from '@/pages/sales-report'

export const Route = createFileRoute('/_authed/_office/sales/report')({
  component: SalesReportPage,
})
