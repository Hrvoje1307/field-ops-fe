import type { TokenResponse } from './generated/model'

/**
 * What the fetcher needs from the session. Implemented by `entities/session`
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
  clear(): void
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
