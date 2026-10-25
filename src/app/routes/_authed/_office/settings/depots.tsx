import { createFileRoute } from '@tanstack/react-router'

import { SettingsDepotsPage } from '@/pages/settings-depots'

export const Route = createFileRoute('/_authed/_office/settings/depots')({
  component: SettingsDepotsPage,
})
