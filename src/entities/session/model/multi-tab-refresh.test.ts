/**
 * Integration: the real session store + the real fetcher, with `fetch` mocked.
 * A "tab" is a fresh copy of the modules (vi.resetModules) sharing the same
 * localStorage and the same Web Locks manager, like two browser tabs do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TokenResponse } from '@/shared/api/generated/model'

import type { SessionStore } from './session-store'

const API = 'http://localhost/api/v1'
const KEY = 'fieldops.refreshToken'

interface Tab {
  store: SessionStore
  customFetch: <T>(url: string, init?: RequestInit) => Promise<T>
}

const tabs: Tab[] = []

async function openTab(): Promise<Tab> {
  vi.resetModules()
  const { createSessionStore } = await import('./session-store')
  const { configureSessionStore } = await import('@/shared/api/session-port')
  const { customFetch } = await import('@/shared/api/fetcher')
  const store = createSessionStore()
  configureSessionStore(store)
  const tab = { store, customFetch }
  tabs.push(tab)
  return tab
}

/** Serialises callbacks per lock name, like navigator.locks across tabs. */
function installFakeWebLocks() {
  const queues = new Map<string, Promise<unknown>>()
  const request = vi.fn((name: string, task: () => Promise<unknown>) => {
    const previous = queues.get(name) ?? Promise.resolve()
    const run = previous.then(task, task)
    queues.set(
      name,
      run.catch(() => undefined),
    )
    return run
  })
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  return request
}

/**
 * Fake backend with rotating refresh tokens: `refresh-n` → `access-(n+1)` + `refresh-(n+1)`.
 * A refresh token works once; reusing it is theft → 401 (and real backends revoke the family).
 */
function installBackend(initialRefresh = 'refresh-0') {
  const issued = new Set([initialRefresh])
  const used = new Set<string>()
  const validAccess = new Set<string>()
  const refreshBodies: string[] = []
  let counter = Number(initialRefresh.split('-')[1])

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url === `${API}/auth/refresh`) {
      const { refreshToken } = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
        refreshToken: string
      }
      refreshBodies.push(refreshToken)
      // Let other "tabs" interleave while this refresh is on the wire
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (!issued.has(refreshToken) || used.has(refreshToken)) {
        return new Response(JSON.stringify({ status: 401, title: 'Refresh token reused' }), {
          status: 401,
          headers: { 'content-type': 'application/problem+json' },
        })
      }
      used.add(refreshToken)
      counter += 1
      const tokens: TokenResponse = {
        accessToken: `access-${String(counter)}`,
        refreshToken: `refresh-${String(counter)}`,
        expiresIn: 900,
        tenantId: '0190a1b2-0000-7000-8000-000000000001',
        role: 'dispatcher',
      }
      issued.add(tokens.refreshToken)
      validAccess.add(tokens.accessToken)
      return Response.json(tokens)
    }

    const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '')
    return token && validAccess.has(token)
      ? Response.json({ ok: true })
      : new Response(JSON.stringify({ status: 401 }), {
          status: 401,
          headers: { 'content-type': 'application/problem+json' },
        })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { refreshBodies, fetchMock }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  for (const tab of tabs.splice(0)) tab.store.dispose()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('refresh across tabs', () => {
  it('serialises refreshes through the Web Lock, so a rotated token is never reused', async () => {
    const lockRequest = installFakeWebLocks()
    const backend = installBackend('refresh-0')
    localStorage.setItem(KEY, 'refresh-0')
    // Two tabs reloaded with the same refresh token and no access token
    const tabA = await openTab()
    const tabB = await openTab()

    const results = await Promise.all([tabA.customFetch('/jobs'), tabB.customFetch('/jobs')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    // Tab B re-read storage inside the lock and refreshed with tab A's rotated token
    expect(backend.refreshBodies).toEqual(['refresh-0', 'refresh-1'])
    expect(lockRequest).toHaveBeenCalledTimes(2)
    expect(lockRequest).toHaveBeenCalledWith('fieldops-refresh', expect.any(Function))
    expect(localStorage.getItem(KEY)).toBe('refresh-2')
    expect(tabA.store.getRefreshToken()).toBe('refresh-1') // adopts refresh-2 on its next refresh
    expect(tabB.store.getRefreshToken()).toBe('refresh-2')
  })

  it('picks up a token rotated by another tab instead of reusing the old one', async () => {
    const backend = installBackend('refresh-5')
    const tab = await openTab()
    tab.store.setTokens({
      accessToken: 'access-expired',
      refreshToken: 'refresh-4',
      expiresIn: 900,
      tenantId: '0190a1b2-0000-7000-8000-000000000001',
      role: 'dispatcher',
    })
    // Another tab rotated refresh-4 → refresh-5; its storage event hasn't reached us
    localStorage.setItem(KEY, 'refresh-5')

    await expect(tab.customFetch('/jobs')).resolves.toEqual({ ok: true })

    expect(backend.refreshBodies).toEqual(['refresh-5'])
    expect(backend.refreshBodies).not.toContain('refresh-4')
  })

  it('uses a rotated token announced by a storage event', async () => {
    const backend = installBackend('refresh-7')
    localStorage.setItem(KEY, 'refresh-6')
    const tab = await openTab()

    // Another tab rotated it and the browser told us
    localStorage.setItem(KEY, 'refresh-7')
    window.dispatchEvent(
      new StorageEvent('storage', { key: KEY, newValue: 'refresh-7', storageArea: localStorage }),
    )
    expect(tab.store.getRefreshToken()).toBe('refresh-7')

    await expect(tab.customFetch('/jobs')).resolves.toEqual({ ok: true })
    expect(backend.refreshBodies).toEqual(['refresh-7'])
  })

  it('logout in another tab clears this one: no bearer, no refresh', async () => {
    const backend = installBackend('refresh-0')
    const tab = await openTab()
    tab.store.setTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-0',
      expiresIn: 900,
      tenantId: '0190a1b2-0000-7000-8000-000000000001',
      role: 'dispatcher',
    })

    // The other tab logs out
    localStorage.removeItem(KEY)
    window.dispatchEvent(
      new StorageEvent('storage', { key: KEY, newValue: null, storageArea: localStorage }),
    )

    expect(tab.store.getSnapshot().isAuthenticated).toBe(false)
    await expect(tab.customFetch('/jobs')).rejects.toMatchObject({ status: 401 })
    const [jobsCall] = backend.fetchMock.mock.calls
    expect(new Headers(jobsCall?.[1]?.headers).has('Authorization')).toBe(false)
    expect(backend.refreshBodies).toEqual([])
  })
})
