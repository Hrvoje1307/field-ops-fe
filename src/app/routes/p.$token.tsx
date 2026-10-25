import { createFileRoute } from '@tanstack/react-router'

import { PublicAppointmentPage } from '@/pages/public-appointment'

/** The client's page, from the link in a message. Outside the signed-in area. */
export const Route = createFileRoute('/p/$token')({
  component: PublicRoute,
})

function PublicRoute() {
  const { token } = Route.useParams()
  return <PublicAppointmentPage token={token} />
}
