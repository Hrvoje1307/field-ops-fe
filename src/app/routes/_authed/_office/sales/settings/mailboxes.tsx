import { createFileRoute, redirect } from '@tanstack/react-router'

import { mailboxesSearchSchema } from '@/pages/settings-mailboxes'

/**
 * The address the backend sends the browser back to after connecting a mailbox
 * (`{APP_URL}/sales/settings/mailboxes?connected={id}` or `?error={code}`). The settings
 * live under `/settings/sales/*` (owner only, with the other settings), so this only
 * passes on, with the result in the address.
 */
export const Route = createFileRoute('/_authed/_office/sales/settings/mailboxes')({
  validateSearch: mailboxesSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/settings/sales/mailboxes', search, replace: true })
  },
})
