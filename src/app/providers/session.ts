import type { QueryClient } from '@tanstack/react-query'

import { loginSearchFor, sessionStore } from '@/entities/auth'
import { configureSessionStore } from '@/shared/api/session-port'

import type { router as appRouter } from '../router'

/** Gives the API fetcher (shared) access to the session (entities). */
export function connectSession(): void {
  configureSessionStore(sessionStore)
}

const PUBLIC_PATHS = ['/login', '/forgot-password']

/**
 * Reacts to session changes:
 * - session ended (signed out here or in another tab, refresh rejected, access
 *   revoked): go to /login (back to the current page afterwards, except after an
 *   own sign-out or revoked access) and drop the cached data once there;
 * - tenant switched (here or in another tab): refetch everything for the new
 *   tenant and re-run the route guards (the role may differ).
 */
export function startSessionWatcher(
  router: typeof appRouter,
  queryClient: QueryClient,
): () => void {
  let previous = sessionStore.getSnapshot()

  // Clearing while signed-in screens are still mounted would cancel their queries
  // (and the route guard's /me); clear once the navigation to /login has finished.
  const clearAfterNavigation = () => {
    const unsubscribe = router.subscribe('onResolved', () => {
      unsubscribe()
      queryClient.clear()
    })
  }

  return sessionStore.subscribe(() => {
    const next = sessionStore.getSnapshot()
    const before = previous
    previous = next

    if (before.isAuthenticated && !next.isAuthenticated) {
      const reason = next.endReason ?? 'other_tab'
      const { pathname, href } = router.state.location
      const navigating = router.state.status === 'pending'
      if (PUBLIC_PATHS.includes(pathname) && !navigating) {
        queryClient.clear()
        return
      }
      clearAfterNavigation()
      // Own sign-out navigates itself; during a navigation the route guard redirects
      if (reason === 'signed_out' || navigating) return
      void router.navigate({ to: '/login', search: loginSearchFor(reason, href), replace: true })
      return
    }

    if (before.tenantId && next.tenantId && before.tenantId !== next.tenantId) {
      // reset (not clear): mounted screens drop the old tenant's data and refetch
      void queryClient.resetQueries()
      void router.invalidate()
    }
  })
}
