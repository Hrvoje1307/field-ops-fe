import { createFileRoute } from '@tanstack/react-router'

import { SalesBoardPage } from '@/pages/sales-board'

export const Route = createFileRoute('/_authed/_office/sales/board')({
  component: SalesBoardPage,
})
