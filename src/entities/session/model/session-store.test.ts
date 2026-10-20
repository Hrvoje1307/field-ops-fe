import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TokenResponse } from '@/shared/api/generated/model'

import {
  createSessionStore,
  REFRESH_TOKEN_KEY,
  type SessionStore,
  TENANT_KEY,
} from './session-store'

const TOKENS: TokenResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  tenantId: '0190a1b2-0000-7000-8000-000000000001',
  role: 'technician',
}

/** Simulates a write to localStorage from another tab (only other tabs get `storage` events). */
function storageEventFromOtherTab(key: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent('storage', { key, newValue, oldValue: null, storageArea: localStorage }),
  )
}

const stores: SessionStore[] = []
function create(...args: Parameters<typeof createSessionStore>) {
  const store = createSessionStore(...args)
  stores.push(store)
  return store
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose()
})

describe('session store', () => {
  it('keeps the access token in memory and persists only the refresh token', () => {
    const store = create()

    store.setTokens(TOKENS)

    expect(store.getAccessToken()).toBe('access-1')
    expect(store.getRefreshToken()).toBe('refresh-1')
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-1')
    expect(localStorage.getItem(TENANT_KEY)).toBe(TOKENS.tenantId)
    // Nothing else is persisted (no access token)
    expect(localStorage).toHaveLength(2)
    expect(store.getSnapshot()).toEqual({
      isAuthenticated: true,
      role: 'technician',
      tenantId: TOKENS.tenantId,
      endReason: null,
    })
  })

  it('restores the refresh token and tenant (not the access token) after a reload', () => {
    create().setTokens(TOKENS)

    const reloaded = create()

    expect(reloaded.getRefreshToken()).toBe('refresh-1')
    expect(reloaded.getAccessToken()).toBeNull()
    expect(reloaded.getSnapshot()).toEqual({
      isAuthenticated: true,
      role: null,
      tenantId: TOKENS.tenantId,
      endReason: null,
    })
  })

  it('clear() wipes memory and storage', () => {
    const store = create()
    store.setTokens(TOKENS)

    store.clear()

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(TENANT_KEY)).toBeNull()
    expect(store.getSnapshot()).toMatchObject({ isAuthenticated: false, endReason: 'signed_out' })
  })

  it('records why the session ended, and forgets it on the next sign-in', () => {
    const store = create()
    store.setTokens(TOKENS)
    store.clear('revoked')
    expect(store.getSnapshot().endReason).toBe('revoked')
    store.setTokens(TOKENS)
    expect(store.getSnapshot().endReason).toBeNull()
  })

  it('notifies subscribers and keeps the snapshot stable between changes', () => {
    const store = create()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const before = store.getSnapshot()

    expect(store.getSnapshot()).toBe(before)
    store.setTokens(TOKENS)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).not.toBe(before)

    unsubscribe()
    store.clear()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('when localStorage throws', () => {
  const throwingStorage = {
    getItem: vi.fn(() => {
      throw new DOMException('denied', 'SecurityError')
    }),
    setItem: vi.fn(() => {
      throw new DOMException('full', 'QuotaExceededError')
    }),
    removeItem: vi.fn(() => {
      throw new DOMException('denied', 'SecurityError')
    }),
  } as unknown as Storage

  it('never throws and keeps the refresh token in memory for this tab', () => {
    const store = create({ storage: throwingStorage, events: null })

    expect(store.getRefreshToken()).toBeNull()
    store.setTokens(TOKENS)
    expect(store.getRefreshToken()).toBe('refresh-1')
    // Memory-only mode: a failed read must not wipe the token
    expect(store.reloadRefreshToken()).toBe('refresh-1')
    store.clear()
    expect(store.getRefreshToken()).toBeNull()
  })

  it('works with no storage at all', () => {
    const store = create({ storage: null, events: null })

    store.setTokens(TOKENS)

    expect(store.reloadRefreshToken()).toBe('refresh-1')
  })
})

describe('other tabs', () => {
  it('reloadRefreshToken() adopts a token rotated in another tab', () => {
    const store = create()
    store.setTokens(TOKENS)
    const listener = vi.fn()
    store.subscribe(listener)

    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-2') // written by another tab, event not seen yet

    expect(store.getRefreshToken()).toBe('refresh-1')
    expect(store.reloadRefreshToken()).toBe('refresh-2')
    expect(store.getRefreshToken()).toBe('refresh-2')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reloadRefreshToken() ends the session if another tab removed the token', () => {
    const store = create()
    store.setTokens(TOKENS)

    localStorage.removeItem(REFRESH_TOKEN_KEY)

    expect(store.reloadRefreshToken()).toBeNull()
    expect(store.getAccessToken()).toBeNull()
  })

  it('updates the in-memory refresh token when another tab rotates it', () => {
    const store = create()
    store.setTokens(TOKENS)
    const listener = vi.fn()
    store.subscribe(listener)

    storageEventFromOtherTab(REFRESH_TOKEN_KEY, 'refresh-2')

    expect(store.getRefreshToken()).toBe('refresh-2')
    // This tab's access token stays valid until it expires
    expect(store.getAccessToken()).toBe('access-1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['logs out (removes the token)', REFRESH_TOKEN_KEY],
    ['clears all of localStorage', null],
  ])('clears this session when another tab %s', (_label, key) => {
    const store = create()
    store.setTokens(TOKENS)
    const listener = vi.fn()
    store.subscribe(listener)

    storageEventFromOtherTab(key, null)

    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBeNull()
    expect(store.getSnapshot()).toEqual({
      isAuthenticated: false,
      role: null,
      tenantId: null,
      endReason: 'other_tab',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows a tenant switch made in another tab', () => {
    const store = create()
    store.setTokens(TOKENS)
    const listener = vi.fn()
    store.subscribe(listener)

    // The other tab writes the new refresh token, then the new tenant
    storageEventFromOtherTab(REFRESH_TOKEN_KEY, 'refresh-2')
    storageEventFromOtherTab(TENANT_KEY, 'tenant-b')

    expect(store.getSnapshot()).toMatchObject({
      isAuthenticated: true,
      tenantId: 'tenant-b',
      role: null,
    })
    // The old tenant's access token is dropped; the next request refreshes into tenant B
    expect(store.getAccessToken()).toBeNull()
    expect(store.getRefreshToken()).toBe('refresh-2')
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores storage events for other keys', () => {
    const store = create()
    store.setTokens(TOKENS)

    storageEventFromOtherTab('something.else', null)

    expect(store.getRefreshToken()).toBe('refresh-1')
  })

  it('stops listening after dispose()', () => {
    const store = create()
    store.setTokens(TOKENS)
    store.dispose()

    storageEventFromOtherTab(REFRESH_TOKEN_KEY, null)

    expect(store.getRefreshToken()).toBe('refresh-1')
  })
})
