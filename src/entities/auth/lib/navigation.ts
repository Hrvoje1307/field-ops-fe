import { ApiError } from '@/shared/api/api-error'
import type { Role } from '@/shared/api/generated/model'
import { ACCESS_REVOKED_CODE, type SessionEndReason } from '@/shared/api/session-port'

/** Where each role starts: the office area or the technician's phone view. */
export function roleHome(role: Role): '/' | '/field' {
  return role === 'technician' ? '/field' : '/'
}

const PUBLIC_PATHS = ['/login', '/forgot-password']

/**
 * A redirect target is only kept when it's a path inside this app
 * (no other origins, no protocol-relative `//host`, not the login page itself).
 */
export function safeRedirect(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return undefined
  }
  try {
    const base = 'http://app.invalid'
    const url = new URL(value, base)
    if (url.origin !== base || PUBLIC_PATHS.includes(url.pathname)) return undefined
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return undefined
  }
}

/** Why the login page is shown (a message above the form). */
export const LOGIN_REASONS = ['access_revoked', 'session_expired', 'signed_out_elsewhere'] as const
export type LoginReason = (typeof LOGIN_REASONS)[number]

export interface LoginSearch {
  redirect?: string
  reason?: LoginReason
}

/**
 * Search params for /login after a session ended. Own sign-out goes to plain /login;
 * expired sessions and sign-outs in other tabs come back to where the user was.
 */
export function loginSearchFor(reason: SessionEndReason, currentHref: string): LoginSearch {
  switch (reason) {
    case 'signed_out':
      return {}
    case 'revoked':
      return { reason: 'access_revoked' }
    case 'expired':
      return { redirect: safeRedirect(currentHref), reason: 'session_expired' }
    case 'other_tab':
      return { redirect: safeRedirect(currentHref), reason: 'signed_out_elsewhere' }
  }
}

/** Whether a failed `/me` means the session is over, and why (null: some other error). */
export function sessionEndReasonOf(error: unknown): 'revoked' | 'expired' | null {
  if (!(error instanceof ApiError)) return null
  const code = (error.problem as { code?: unknown } | undefined)?.code
  if (error.status === 403 || (error.status === 401 && code === ACCESS_REVOKED_CODE))
    return 'revoked'
  return error.status === 401 ? 'expired' : null
}
