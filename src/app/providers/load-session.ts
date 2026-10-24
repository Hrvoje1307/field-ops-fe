import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { fetchMe, loginSearchFor, sessionEndReasonOf, sessionStore } from '@/entities/auth'
import { fetchTenant } from '@/entities/tenant'
import type { Me } from '@/shared/api/generated/model'

/**
 * Guard for the signed-in area: no session → /login (back here afterwards);
 * `/me` decides whether the session is still valid (revoked access → /login with
 * a message). `/tenant` only feeds formatting: if it fails, defaults are used.
 */
export async function loadSignedInSession(
  queryClient: QueryClient,
  href: string,
): Promise<{ me: Me }> {
  if (!sessionStore.getSnapshot().isAuthenticated) {
    throw redirect({ to: '/login', search: { redirect: href } })
  }

  let me: Me
  try {
    // Cached data is reused while fresh (5 min), refetched when stale
    me = await fetchMe(queryClient)
  } catch (error) {
    const reason = sessionEndReasonOf(error)
    if (!reason) throw error
    sessionStore.clear(reason)
    throw redirect({ to: '/login', search: loginSearchFor(reason, href) })
  }

  // E.g. a role that may not read /tenant must not lose its session over it
  await fetchTenant(queryClient).catch(() => undefined)
  return { me }
}
