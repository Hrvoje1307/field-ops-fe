import { createFileRoute } from '@tanstack/react-router'

import { SettingsSalesAiPage } from '@/pages/settings-sales-ai'

export const Route = createFileRoute('/_authed/_office/settings/sales/ai')({
  component: SettingsSalesAiPage,
})
