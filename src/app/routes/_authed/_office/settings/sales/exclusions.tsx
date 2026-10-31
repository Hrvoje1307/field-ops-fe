import { createFileRoute } from '@tanstack/react-router'

import { SettingsExclusionsPage } from '@/pages/settings-exclusions'

export const Route = createFileRoute('/_authed/_office/settings/sales/exclusions')({
  component: SettingsExclusionsPage,
})
