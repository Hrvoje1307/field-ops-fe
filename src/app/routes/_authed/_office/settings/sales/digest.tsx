import { createFileRoute } from '@tanstack/react-router'

import { SettingsSalesDigestPage } from '@/pages/settings-sales-digest'

export const Route = createFileRoute('/_authed/_office/settings/sales/digest')({
  component: SettingsSalesDigestPage,
})
