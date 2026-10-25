import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/_office/settings/')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/company', replace: true })
  },
})
