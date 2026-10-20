import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import {
  loginSearchFor,
  meQueryOptions,
  sessionEndReasonOf,
  sessionStore,
  tenantQueryOptions,
  useTenantSettings,
} from '@/entities/session'
import { TenantFormatProvider } from '@/shared/lib/tenant-format-provider'
import { Spinner } from '@/shared/ui/spinner'

/** Signed-in area: loads /me and /tenant before any child route renders. */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    if (!sessionStore.getSnapshot().isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    try {
      // Cached data is reused while fresh (5 min), refetched when stale
      const [me] = await Promise.all([
        context.queryClient.query(meQueryOptions()),
        context.queryClient.query(tenantQueryOptions()),
      ])
      return { me }
    } catch (error) {
      // Revoked access or an ended session goes to /login with a message, not the error page
      const reason = sessionEndReasonOf(error)
      if (!reason) throw error
      sessionStore.clear(reason)
      throw redirect({ to: '/login', search: loginSearchFor(reason, location.href) })
    }
  },
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
  return (
    <TenantFormatProvider settings={useTenantSettings()}>
      <Outlet />
    </TenantFormatProvider>
  )
}
