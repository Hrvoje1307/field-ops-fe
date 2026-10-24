import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { FieldShell } from '@/widgets/app-shell'

/** Technician area (phone-first). Owners and dispatchers are sent to the office. */
export const Route = createFileRoute('/_authed/field')({
  beforeLoad: ({ context }) => {
    if (context.me.role !== 'technician') throw redirect({ to: '/', replace: true })
  },
  component: FieldLayout,
})

function FieldLayout() {
  return (
    <FieldShell>
      <Outlet />
    </FieldShell>
  )
}
