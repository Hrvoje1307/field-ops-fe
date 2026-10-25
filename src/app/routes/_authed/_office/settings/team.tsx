import { createFileRoute } from '@tanstack/react-router'

import { SettingsTeamPage } from '@/pages/settings-team'

export const Route = createFileRoute('/_authed/_office/settings/team')({
  component: SettingsTeamPage,
})
