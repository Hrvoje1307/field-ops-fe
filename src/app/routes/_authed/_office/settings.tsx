import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { SettingsShell } from '@/widgets/settings-shell'

/** Settings: the owner's. Dispatchers stay on the day (their rights are not in the contract). */
export const Route = createFileRoute('/_authed/_office/settings')({
  beforeLoad: ({ context }) => {
    if (context.me.role !== 'owner') throw redirect({ to: '/', replace: true })
  },
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <SettingsShell>
      <Outlet />
    </SettingsShell>
  )
}
