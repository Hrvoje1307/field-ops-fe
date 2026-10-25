import { createFileRoute } from '@tanstack/react-router'

import { SettingsJobTypesPage } from '@/pages/settings-job-types'

export const Route = createFileRoute('/_authed/_office/settings/job-types')({
  component: SettingsJobTypesPage,
})
