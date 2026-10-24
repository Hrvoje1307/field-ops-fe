import type { TokenResponse } from './generated/model'

/**
 * Why a session ended; decides where the app sends the user.
 * - `signed_out`: the user signed out here
 * - `other_tab`: signed out (or cleared) in another tab
 * - `expired`: the refresh token was rejected
 * - `revoked`: the user or their membership is no longer active
 */
export type SessionEndReason = 'signed_out' | 'other_tab' | 'expired' | 'revoked'

/** Stable code the API uses when access was taken away (docs/backend-questions.md #18). */
export const ACCESS_REVOKED_CODE = 'auth.access_revoked'

/**
 * What the fetcher needs from the session. Implemented by `entities/auth`
 * and wired in `app/providers/session.ts` (shared can't import entities).
 */
export interface SessionTokenStore {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  /**
   * Re-reads the refresh token from persistent storage and adopts it:
   * another tab may have rotated or cleared it since this tab last looked.
   */
  reloadRefreshToken(): string | null
  setTokens(tokens: TokenResponse): void
  clear(reason?: SessionEndReason): void
}

const anonymousStore: SessionTokenStore = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  reloadRefreshToken: () => null,
  setTokens: () => undefined,
  clear: () => undefined,
}

let currentStore: SessionTokenStore = anonymousStore

export function configureSessionStore(store: SessionTokenStore): void {
  currentStore = store
}

export function getSessionStore(): SessionTokenStore {
  return currentStore
}
