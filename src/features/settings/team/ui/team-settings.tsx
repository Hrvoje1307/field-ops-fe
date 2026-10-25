import { InvitationsSection } from './invitations-section'
import { MembersSection } from './members-section'

/** Who is on the team: members with their roles and technician data, and open invitations. */
export function TeamSettings() {
  return (
    <div className="max-w-3xl space-y-10">
      <MembersSection />
      <InvitationsSection />
    </div>
  )
}
