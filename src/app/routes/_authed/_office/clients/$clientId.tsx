import { createFileRoute } from '@tanstack/react-router'

import { ClientDetailPage } from '@/pages/client-detail'

export const Route = createFileRoute('/_authed/_office/clients/$clientId')({
  component: ClientDetailRoute,
})

function ClientDetailRoute() {
  const { clientId } = Route.useParams()
  return <ClientDetailPage clientId={clientId} />
}
