import { createFileRoute } from '@tanstack/react-router'

import { ClientsListPage } from '@/pages/clients-list'

export const Route = createFileRoute('/_authed/_office/clients')({
  component: ClientsListPage,
})
