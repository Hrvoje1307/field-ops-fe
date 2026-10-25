import { createFileRoute } from '@tanstack/react-router'

import { SettingsSkillsPage } from '@/pages/settings-skills'

export const Route = createFileRoute('/_authed/_office/settings/skills')({
  component: SettingsSkillsPage,
})
