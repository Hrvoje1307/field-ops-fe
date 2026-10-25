import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import {
  MESSAGES_SEARCH_DEFAULTS,
  type MessagesSearchChange,
  messagesSearchSchema,
} from '@/features/messages/list'
import { MessagesListPage } from '@/pages/messages-list'

export const Route = createFileRoute('/_authed/_office/messages')({
  validateSearch: messagesSearchSchema,
  search: { middlewares: [stripSearchParams(MESSAGES_SEARCH_DEFAULTS)] },
  component: MessagesRoute,
})

function MessagesRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange: MessagesSearchChange = (patch) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  }
  return <MessagesListPage search={search} onSearchChange={onSearchChange} />
}
