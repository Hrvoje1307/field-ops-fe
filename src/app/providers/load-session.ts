import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import {
  loginSearchFor,
  meQueryOptions,
  sessionEndReasonOf,
  sessionStore,
  tenantQueryOptions,
} from '@/entities/session'
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
    me = await queryClient.query(meQueryOptions())
  } catch (error) {
    const reason = sessionEndReasonOf(error)
    if (!reason) throw error
    sessionStore.clear(reason)
    throw redirect({ to: '/login', search: loginSearchFor(reason, href) })
  }

  // E.g. a role that may not read /tenant must not lose its session over it
  await queryClient.query(tenantQueryOptions()).catch(() => undefined)
  return { me }
}
