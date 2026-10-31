import { createFileRoute } from '@tanstack/react-router'

import { SettingsSalesStagesPage } from '@/pages/settings-sales-stages'

export const Route = createFileRoute('/_authed/_office/settings/sales/stages')({
  component: SettingsSalesStagesPage,
})
