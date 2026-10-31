import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import {
  INBOX_SEARCH_DEFAULTS,
  type InboxSearchChange,
  inboxSearchSchema,
} from '@/features/mail/inbox'
import { SalesInboxPage } from '@/pages/sales-inbox'

export const Route = createFileRoute('/_authed/_office/sales/inbox')({
  validateSearch: inboxSearchSchema,
  search: { middlewares: [stripSearchParams(INBOX_SEARCH_DEFAULTS)] },
  component: InboxRoute,
})

function InboxRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange: InboxSearchChange = (patch, options) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: options?.replace })
  }
  return <SalesInboxPage search={search} onSearchChange={onSearchChange} />
}
