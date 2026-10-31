import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { hasSalesAccess } from '@/entities/auth'

/** The settings of Prodaja: the owner's (the settings above), and only with the module. */
export const Route = createFileRoute('/_authed/_office/settings/sales')({
  beforeLoad: ({ context }) => {
    if (!hasSalesAccess(context.me)) throw redirect({ to: '/settings', replace: true })
  },
  component: Outlet,
})
