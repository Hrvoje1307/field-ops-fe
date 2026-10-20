import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionStore } from '@/entities/session'
import type { TokenResponse } from '@/shared/api/generated/model'

import type { router as appRouter } from '../router'
import { startSessionWatcher } from './session'

const TOKENS: TokenResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  tenantId: 'tenant-a',
  role: 'dispatcher',
}

function fakeRouter(
  pathname = '/jobs',
  href = '/jobs?page=2',
  status: 'idle' | 'pending' = 'idle',
) {
  const resolvedListeners = new Set<() => void>()
  const router = {
    state: { status, location: { pathname, href } },
    navigate: vi.fn(() => Promise.resolve()),
    invalidate: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn((_event: 'onResolved', listener: () => void) => {
      resolvedListeners.add(listener)
      return () => resolvedListeners.delete(listener)
    }),
    /** Test helper: the pending navigation finished. */
    resolve: () => {
      for (const listener of [...resolvedListeners]) listener()
    },
  }
  return router as typeof router & typeof appRouter
}

let stop: () => void = () => undefined
const queryClient = new QueryClient()
let clear = vi.spyOn(queryClient, 'clear')
let resetQueries = vi.spyOn(queryClient, 'resetQueries')

beforeEach(() => {
  sessionStore.setTokens(TOKENS)
  clear = vi.spyOn(queryClient, 'clear')
  resetQueries = vi.spyOn(queryClient, 'resetQueries').mockResolvedValue()
})

afterEach(() => {
  stop()
  vi.restoreAllMocks()
  sessionStore.clear()
})

describe('session watcher', () => {
  it('own sign-out: navigation is left to the feature; data is dropped once /login is shown', () => {
    const router = fakeRouter()
    stop = startSessionWatcher(router, queryClient)
    sessionStore.clear('signed_out')
    expect(router.navigate).not.toHaveBeenCalled()
    // Not while signed-in screens are mounted (their queries would be cancelled)
    expect(clear).not.toHaveBeenCalled()
    router.resolve()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  it('sign-out in another tab: back to /login, returning to the current page', () => {
    const router = fakeRouter()
    stop = startSessionWatcher(router, queryClient)
    sessionStore.clear('other_tab')
    expect(router.navigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/jobs?page=2', reason: 'signed_out_elsewhere' },
      replace: true,
    })
    router.resolve()
    expect(clear).toHaveBeenCalled()
  })

  it('revoked access: /login with the message and no redirect', () => {
    const router = fakeRouter()
    stop = startSessionWatcher(router, queryClient)
    sessionStore.clear('revoked')
    expect(router.navigate).toHaveBeenCalledWith({
      to: '/login',
      search: { reason: 'access_revoked' },
      replace: true,
    })
  })

  it('during a navigation the route guard redirects; data is dropped when it finishes', () => {
    const router = fakeRouter('/jobs', '/jobs', 'pending')
    stop = startSessionWatcher(router, queryClient)
    sessionStore.clear('expired')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    router.resolve()
    expect(clear).toHaveBeenCalled()
  })

  it('already on a public page: just drops the data', () => {
    const router = fakeRouter('/login', '/login')
    stop = startSessionWatcher(router, queryClient)
    sessionStore.clear('other_tab')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalled()
  })

  it('a tenant switch resets the cached data and re-runs the route guards', () => {
    const router = fakeRouter()
    stop = startSessionWatcher(router, queryClient)
    sessionStore.setTokens({ ...TOKENS, tenantId: 'tenant-b', refreshToken: 'refresh-2' })
    expect(resetQueries).toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(router.invalidate).toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })
})
