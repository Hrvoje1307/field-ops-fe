import { createFileRoute } from '@tanstack/react-router'

import { SettingsChecklistsPage } from '@/pages/settings-checklists'

export const Route = createFileRoute('/_authed/_office/settings/checklists')({
  component: SettingsChecklistsPage,
})
