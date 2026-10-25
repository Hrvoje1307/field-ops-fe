import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { getTenant, tenantKeys, useGetTenant, useGetTenantUsage, useUpdateTenant } from './api'
import { tenantFormValues, toTenantBody } from './model/tenant-form'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('useUpdateTenant', () => {
  it('puts the saved company in the cache and refreshes the session and job data', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const tenant = await getTenant()
    queryClient.setQueryData(['auth', 'me'], { tenant: { name: tenant.name } })
    queryClient.setQueryData(['jobs', 'list'], [])
    queryClient.setQueryData(['skills'], [])

    const { result } = renderHook(() => useUpdateTenant(), { wrapper })
    const values = tenantFormValues(tenant)
    values.name = 'Novo ime d.o.o.'
    await act(async () => {
      await result.current.mutateAsync(toTenantBody(values))
    })

    expect(queryClient.getQueryData<{ name: string }>(tenantKeys.current)?.name).toBe(
      'Novo ime d.o.o.',
    )
    expect(isInvalidated(queryClient, ['auth', 'me'])).toBe(true)
    expect(isInvalidated(queryClient, ['jobs', 'list'])).toBe(true)
    // What the tenant's settings do not touch stays as it was
    expect(isInvalidated(queryClient, ['skills'])).toBe(false)
    expect((await getTenant()).name).toBe('Novo ime d.o.o.')
  })

  it('sends the same idempotency key when the same save is tried again', async () => {
    const { wrapper } = queryWrapper()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'PUT') keys.push(request.headers.get('Idempotency-Key'))
    })
    const tenant = await getTenant()
    const body = toTenantBody({ ...tenantFormValues(tenant), timezone: 'Mars/Olympus' })

    const { result } = renderHook(() => useUpdateTenant(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined)
      await result.current.mutateAsync(body).catch(() => undefined)
    })
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })

  it('keeps the cache as it was when the save is refused', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const tenant = await getTenant()
    queryClient.setQueryData(tenantKeys.current, tenant)
    const { result } = renderHook(() => useUpdateTenant(), { wrapper })
    await act(async () => {
      await result.current
        .mutateAsync(toTenantBody({ ...tenantFormValues(tenant), timezone: 'Mars/Olympus' }))
        .catch(() => undefined)
    })
    expect(queryClient.getQueryData(tenantKeys.current)).toEqual(tenant)
    expect(isInvalidated(queryClient, ['jobs', 'list'])).toBe(false)
  })
})

describe('useGetTenant and useGetTenantUsage', () => {
  it('read the company and the month’s usage', async () => {
    const { wrapper } = queryWrapper()
    const tenant = renderHook(() => useGetTenant(), { wrapper })
    const usage = renderHook(() => useGetTenantUsage('2026-10'), { wrapper })
    await waitFor(() => {
      expect(tenant.result.current.data?.slug).toBe('alarmko')
      expect(usage.result.current.data?.month).toBe('2026-10')
    })
  })
})
