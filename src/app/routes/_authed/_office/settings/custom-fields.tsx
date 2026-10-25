import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { z } from 'zod'

import { SettingsCustomFieldsPage } from '@/pages/settings-custom-fields'

const searchSchema = z.object({
  /** Which kind of record's fields are listed. */
  entity: z.enum(['client', 'location', 'asset', 'job']).catch('client'),
})

export const Route = createFileRoute('/_authed/_office/settings/custom-fields')({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams({ entity: 'client' })] },
  component: CustomFieldsRoute,
})

function CustomFieldsRoute() {
  const { entity } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsCustomFieldsPage
      entity={entity}
      onEntityChange={(next) => {
        void navigate({ search: { entity: next } })
      }}
    />
  )
}
