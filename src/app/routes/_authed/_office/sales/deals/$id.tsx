import { createFileRoute } from '@tanstack/react-router'

import { DealDetailPage } from '@/pages/deal-detail'

export const Route = createFileRoute('/_authed/_office/sales/deals/$id')({
  component: DealRoute,
})

function DealRoute() {
  const { id } = Route.useParams()
  return <DealDetailPage dealId={id} />
}
