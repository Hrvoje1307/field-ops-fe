import { createFileRoute } from '@tanstack/react-router'

import { SettingsFollowUpRulesPage } from '@/pages/settings-follow-up-rules'

export const Route = createFileRoute('/_authed/_office/settings/sales/follow-up-rules')({
  component: SettingsFollowUpRulesPage,
})
