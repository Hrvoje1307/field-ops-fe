import { createFileRoute, Outlet } from '@tanstack/react-router'

import { useMe } from '@/entities/auth'
import { useRealtime } from '@/entities/realtime'
import { useTenantSettings } from '@/entities/tenant'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Spinner } from '@/shared/ui/spinner'

import { loadSignedInSession } from '../providers/load-session'

/** Signed-in area: loads /me and /tenant before any child route renders. */
export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context, location }) => loadSignedInSession(context.queryClient, location.href),
  pendingComponent: FullScreenSpinner,
  component: AuthedLayout,
})

function FullScreenSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

function AuthedLayout() {
  // The live connection lives as long as the signed-in area, one per company
  useRealtime(useMe().tenant.id)
  return (
    <TenantFormatProvider settings={useTenantSettings()}>
      <Outlet />
    </TenantFormatProvider>
  )
}
