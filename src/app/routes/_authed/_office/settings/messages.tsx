import { createFileRoute } from '@tanstack/react-router'

import { SettingsMessagesPage } from '@/pages/settings-messages'

export const Route = createFileRoute('/_authed/_office/settings/messages')({
  component: SettingsMessagesPage,
})
