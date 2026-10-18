import type { Role, TokenResponse } from '@/shared/api/generated/model'
import type { SessionTokenStore } from '@/shared/api/session-port'

export const REFRESH_TOKEN_KEY = 'fieldops.refreshToken'

export interface SessionSnapshot {
  /** A refresh token exists, so the session can be resumed. */
  isAuthenticated: boolean
  /** Known once tokens were issued or refreshed in this tab. */
  role: Role | null
  tenantId: string | null
}

export interface SessionStore extends SessionTokenStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): SessionSnapshot
  /** Stops listening to other tabs. */
  dispose(): void
}

type StorageEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

export interface SessionStoreOptions {
  /** Where the refresh token persists; `null` = memory only. */
  storage?: Storage | null
  /** Receives `storage` events from other tabs; `null` = don't listen. */
  events?: StorageEventTarget | null
}

function getLocalStorage(): Storage | null {
  try {
    // Accessing localStorage itself throws when site data is blocked
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Access token, role and tenant live in memory only; the refresh token is
 * persisted in localStorage so the session survives a reload. Every storage
 * call is guarded: when storage fails, the refresh token stays in memory for
 * this tab.
 */
export function createSessionStore({
  storage = getLocalStorage(),
  events = typeof window === 'undefined' ? null : window,
}: SessionStoreOptions = {}): SessionStore {
  /** `undefined` = storage unavailable or the read failed. */
  function readStoredToken(): string | null | undefined {
    if (!storage) return undefined
    try {
      return storage.getItem(REFRESH_TOKEN_KEY)
    } catch {
      return undefined
    }
  }

  /** Returns whether the value reached storage. */
  function writeStoredToken(value: string | null): boolean {
    if (!storage) return false
    try {
      if (value === null) storage.removeItem(REFRESH_TOKEN_KEY)
      else storage.setItem(REFRESH_TOKEN_KEY, value)
      return true
    } catch {
      return false
    }
  }

  let accessToken: string | null = null
  let role: Role | null = null
  let tenantId: string | null = null
  let refreshToken: string | null = readStoredToken() ?? null
  /** false while the refresh token only lives in memory (storage write failed). */
  let persisted = true

  const listeners = new Set<() => void>()
  let snapshot = createSnapshot()

  function createSnapshot(): SessionSnapshot {
    return { isAuthenticated: refreshToken !== null, role, tenantId }
  }

  function emit() {
    snapshot = createSnapshot()
    for (const listener of listeners) listener()
  }

  function resetSession() {
    accessToken = null
    role = null
    tenantId = null
    refreshToken = null
    persisted = true
  }

  function onStorage(event: StorageEvent) {
    if (event.storageArea !== storage) return
    // key === null: another tab called localStorage.clear()
    if (event.key !== null && event.key !== REFRESH_TOKEN_KEY) return
    const next = event.key === null ? null : event.newValue
    if (next === refreshToken) return

    if (next === null) {
      // Logged out in another tab
      resetSession()
    } else {
      // Rotated in another tab; this tab's access token stays valid until it expires
      refreshToken = next
      persisted = true
    }
    emit()
  }

  events?.addEventListener('storage', onStorage)

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,

    reloadRefreshToken() {
      // Memory-only mode: storage never got this tab's token
      if (!persisted) return refreshToken
      const stored = readStoredToken()
      if (stored === undefined || stored === refreshToken) return refreshToken

      if (stored === null) resetSession()
      else refreshToken = stored
      emit()
      return refreshToken
    },

    setTokens(tokens: TokenResponse) {
      accessToken = tokens.accessToken
      role = tokens.role
      tenantId = tokens.tenantId
      refreshToken = tokens.refreshToken
      persisted = writeStoredToken(tokens.refreshToken)
      emit()
    },

    clear() {
      resetSession()
      writeStoredToken(null)
      emit()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot: () => snapshot,

    dispose() {
      events?.removeEventListener('storage', onStorage)
      listeners.clear()
    },
  }
}

export const sessionStore = createSessionStore()
