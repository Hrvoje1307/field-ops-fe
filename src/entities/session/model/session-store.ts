import type { Role, TokenResponse } from '@/shared/api/generated/model'
import type { SessionEndReason, SessionTokenStore } from '@/shared/api/session-port'

export const REFRESH_TOKEN_KEY = 'fieldops.refreshToken'
/** Active tenant, so other tabs notice a tenant switch. Not a secret. */
export const TENANT_KEY = 'fieldops.tenantId'

export interface SessionSnapshot {
  /** A refresh token exists, so the session can be resumed. */
  isAuthenticated: boolean
  /** Known once tokens were issued or refreshed in this tab. */
  role: Role | null
  tenantId: string | null
  /** Why the last session ended (null while signed in or never signed in). */
  endReason: SessionEndReason | null
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
 * Access token and role live in memory only; the refresh token (and the
 * active tenant id) are persisted in localStorage so the session survives a
 * reload. Every storage call is guarded: when storage fails, the refresh token
 * stays in memory for this tab.
 */
export function createSessionStore({
  storage = getLocalStorage(),
  events = typeof window === 'undefined' ? null : window,
}: SessionStoreOptions = {}): SessionStore {
  /** `undefined` = storage unavailable or the read failed. */
  function read(key: string): string | null | undefined {
    if (!storage) return undefined
    try {
      return storage.getItem(key)
    } catch {
      return undefined
    }
  }

  /** Returns whether the value reached storage. */
  function write(key: string, value: string | null): boolean {
    if (!storage) return false
    try {
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  let accessToken: string | null = null
  let role: Role | null = null
  let refreshToken: string | null = read(REFRESH_TOKEN_KEY) ?? null
  let tenantId: string | null = refreshToken ? (read(TENANT_KEY) ?? null) : null
  let endReason: SessionEndReason | null = null
  /** false while the refresh token only lives in memory (storage write failed). */
  let persisted = true

  const listeners = new Set<() => void>()
  let snapshot = createSnapshot()

  function createSnapshot(): SessionSnapshot {
    return { isAuthenticated: refreshToken !== null, role, tenantId, endReason }
  }

  function emit() {
    snapshot = createSnapshot()
    for (const listener of listeners) listener()
  }

  function resetSession(reason: SessionEndReason) {
    accessToken = null
    role = null
    tenantId = null
    refreshToken = null
    persisted = true
    endReason = reason
  }

  function onStorage(event: StorageEvent) {
    if (event.storageArea !== storage) return

    // key === null: another tab called localStorage.clear()
    if (event.key === null || (event.key === REFRESH_TOKEN_KEY && event.newValue === null)) {
      if (refreshToken === null) return
      resetSession('other_tab')
      emit()
      return
    }

    if (event.key === REFRESH_TOKEN_KEY && event.newValue !== refreshToken) {
      // Rotated (or signed in) in another tab; this tab's access token stays valid until it expires
      refreshToken = event.newValue
      persisted = true
      endReason = null
      emit()
      return
    }

    if (event.key === TENANT_KEY && event.newValue && event.newValue !== tenantId) {
      // Another tab switched tenant: this tab's access token belongs to the old one.
      // Drop it; the next request refreshes into the new tenant.
      tenantId = event.newValue
      accessToken = null
      role = null
      emit()
    }
  }

  events?.addEventListener('storage', onStorage)

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,

    reloadRefreshToken() {
      // Memory-only mode: storage never got this tab's token
      if (!persisted) return refreshToken
      const stored = read(REFRESH_TOKEN_KEY)
      if (stored === undefined || stored === refreshToken) return refreshToken

      if (stored === null) resetSession('other_tab')
      else refreshToken = stored
      emit()
      return refreshToken
    },

    setTokens(tokens: TokenResponse) {
      accessToken = tokens.accessToken
      role = tokens.role
      tenantId = tokens.tenantId
      refreshToken = tokens.refreshToken
      endReason = null
      persisted = write(REFRESH_TOKEN_KEY, tokens.refreshToken)
      write(TENANT_KEY, tokens.tenantId)
      emit()
    },

    clear(reason: SessionEndReason = 'signed_out') {
      resetSession(reason)
      write(REFRESH_TOKEN_KEY, null)
      write(TENANT_KEY, null)
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
