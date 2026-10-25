import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { configureSessionStore } from '@/shared/api/session-port'
import { queryWrapper } from '@/shared/api/test/hook-test-utils'

import { useLogin, useSwitchTenant } from './api'
import { sessionStore } from './model/session-store'

beforeEach(() => {
  resetMockDb()
  configureSessionStore(sessionStore)
  sessionStore.clear()
})

describe('useLogin', () => {
  it('starts the session with an empty cache and the new tokens', async () => {
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(['jobs', 'list'], { items: ['left over from another session'] })
    const { result } = renderHook(() => useLogin(), { wrapper })

    await act(() =>
      result.current.mutateAsync({ email: 'dispecer@alarmko.test', password: 'demo' }),
    )

    expect(queryClient.getQueryData(['jobs', 'list'])).toBeUndefined()
    expect(sessionStore.getSnapshot().isAuthenticated).toBe(true)
  })

  it('a wrong password leaves the cache and the session alone', async () => {
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(['x'], 1)
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(async () => {
      await result.current
        .mutateAsync({ email: 'dispecer@alarmko.test', password: 'wrong' })
        .catch(() => undefined)
    })
    expect(queryClient.getQueryData(['x'])).toBe(1)
    expect(sessionStore.getSnapshot().isAuthenticated).toBe(false)
  })
})

describe('useSwitchTenant', () => {
  it('the new tokens replace the session', async () => {
    const { wrapper } = queryWrapper()
    const login = renderHook(() => useLogin(), { wrapper })
    await act(() => login.result.current.mutateAsync({ email: 'ana@demo.test', password: 'demo' }))
    const before = sessionStore.getSnapshot().tenantId

    const memberships = (await import('@/shared/api/api-fetch')).apiFetch<{
      memberships: { tenant: { id: string } }[]
    }>('/me')
    const other = (await memberships).memberships.find((m) => m.tenant.id !== before)
    if (!other) throw new Error('Ana belongs to two tenants')
    const { result } = renderHook(() => useSwitchTenant(), { wrapper })
    await act(() => result.current.mutateAsync({ tenantId: other.tenant.id }))

    expect(sessionStore.getSnapshot().tenantId).toBe(other.tenant.id)
  })
})
