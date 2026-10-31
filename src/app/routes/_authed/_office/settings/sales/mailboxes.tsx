import { createFileRoute } from '@tanstack/react-router'

import { mailboxesSearchSchema, SettingsMailboxesPage } from '@/pages/settings-mailboxes'

export const Route = createFileRoute('/_authed/_office/settings/sales/mailboxes')({
  validateSearch: mailboxesSearchSchema,
  component: MailboxesRoute,
})

function MailboxesRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsMailboxesPage
      search={search}
      // Said once; the address goes back to the plain page without a new history entry
      onClearSearch={() => {
        void navigate({ search: {}, replace: true })
      }}
    />
  )
}
