import { createFileRoute } from '@tanstack/react-router'

import { mailboxesSearchSchema, SettingsMailboxesPage } from '@/pages/settings-mailboxes'

export const Route = createFileRoute('/_authed/_office/settings/sales/mailboxes')({
  validateSearch: mailboxesSearchSchema,
  component: SettingsMailboxesPage,
})
