import { createFileRoute } from '@tanstack/react-router'

import { RoutePlanPage } from '@/pages/route-plan'

export const Route = createFileRoute('/_authed/_office/plans/$planId')({
  component: RoutePlanRoute,
})

function RoutePlanRoute() {
  const { planId } = Route.useParams()
  return <RoutePlanPage planId={planId} />
}
