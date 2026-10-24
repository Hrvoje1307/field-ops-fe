import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import {
  CLIENTS_SEARCH_DEFAULTS,
  type ClientsSearchChange,
  clientsSearchSchema,
} from '@/features/client/list'
import { ClientsListPage } from '@/pages/clients-list'

export const Route = createFileRoute('/_authed/_office/clients/')({
  validateSearch: clientsSearchSchema,
  search: { middlewares: [stripSearchParams(CLIENTS_SEARCH_DEFAULTS)] },
  component: ClientsListRoute,
})

function ClientsListRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange: ClientsSearchChange = (patch, options) => {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: options?.replace })
  }
  return <ClientsListPage search={search} onSearchChange={onSearchChange} />
}
