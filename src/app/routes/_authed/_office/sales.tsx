import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { hasSalesAccess } from '@/entities/auth'
import { SalesShell } from '@/widgets/sales-shell'

/**
 * Prodaja: the plan has the module and the user may use it (`/me`). Otherwise the app is
 * what it was without it, so this is the day. A technician never gets here (the office
 * guard above sends them to the field view).
 */
export const Route = createFileRoute('/_authed/_office/sales')({
  beforeLoad: ({ context }) => {
    if (!hasSalesAccess(context.me)) throw redirect({ to: '/', replace: true })
  },
  component: SalesLayout,
})

function SalesLayout() {
  return (
    <SalesShell>
      <Outlet />
    </SalesShell>
  )
}
