import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { OfficeShell } from '@/widgets/app-shell'

/** Office area (owner, dispatcher). Technicians are sent to their field view. */
export const Route = createFileRoute('/_authed/_office')({
  beforeLoad: ({ context }) => {
    if (context.me.role === 'technician') throw redirect({ to: '/field', replace: true })
  },
  component: OfficeLayout,
})

function OfficeLayout() {
  return (
    <OfficeShell>
      <Outlet />
    </OfficeShell>
  )
}
