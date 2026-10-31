/** The error codes of the OAuth return (`?error=`) the spec lists. */
export const OAUTH_ERROR_CODES = [
  'access_denied',
  'wrong_account',
  'already_connected',
  'provider_error',
] as const

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number]

export type OAuthReturn =
  { kind: 'connected'; mailboxId: string } | { kind: 'error'; code: OAuthErrorCode | null }

const isKnown = (code: string): code is OAuthErrorCode =>
  (OAUTH_ERROR_CODES as readonly string[]).includes(code)

/**
 * What the address says about a connection that has just been tried: `?error=` wins over
 * `?connected=`; a code the spec does not list is an error without a known code (the screen
 * says something generic). Nothing in the address: no return.
 */
export function readOAuthReturn(search: {
  connected?: string | undefined
  error?: string | undefined
}): OAuthReturn | null {
  if (search.error) return { kind: 'error', code: isKnown(search.error) ? search.error : null }
  if (search.connected) return { kind: 'connected', mailboxId: search.connected }
  return null
}
