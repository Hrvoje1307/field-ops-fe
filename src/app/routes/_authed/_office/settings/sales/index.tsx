import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_office/settings/sales/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/sales/mailboxes', replace: true })
  },
})
