import { createFileRoute } from '@tanstack/react-router'

import { SalesInboxPage } from '@/pages/sales-inbox'

export const Route = createFileRoute('/_authed/_office/sales/inbox')({
  component: SalesInboxPage,
})
