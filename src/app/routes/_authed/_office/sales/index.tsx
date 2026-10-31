import { createFileRoute } from '@tanstack/react-router'

import { SalesTodayPage } from '@/pages/sales-today'

export const Route = createFileRoute('/_authed/_office/sales/')({
  component: SalesTodayPage,
})
