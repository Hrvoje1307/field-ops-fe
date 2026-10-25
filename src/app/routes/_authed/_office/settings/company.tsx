import { createFileRoute } from '@tanstack/react-router'

import { SettingsCompanyPage } from '@/pages/settings-company'

export const Route = createFileRoute('/_authed/_office/settings/company')({
  component: SettingsCompanyPage,
})
