import { Appointment } from '@/features/public/appointment'

/** The client's page for one appointment, from the link in a message. */
export function PublicAppointmentPage({ token }: { token: string }) {
  return <Appointment token={token} />
}
