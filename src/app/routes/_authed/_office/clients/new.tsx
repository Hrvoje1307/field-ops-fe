import { createFileRoute } from '@tanstack/react-router'

import { ClientCreatePage } from '@/pages/client-create'

export const Route = createFileRoute('/_authed/_office/clients/new')({
  component: ClientCreatePage,
})
