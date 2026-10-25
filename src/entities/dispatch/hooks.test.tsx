import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { apiFetch } from '@/shared/api/api-fetch'
import type { DispatchBoard, RoutePlan, Technician } from '@/shared/api/generated/model'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'

import {
  dispatchKeys,
  useGetRoutePlan,
  useOptimizeRoutePlan,
  usePublishRoutePlan,
  useUpdateRoutePlan,
} from './api'

const API = 'http://localhost/api/v1'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
})

afterEach(() => {
  vi.restoreAllMocks()
  server.events.removeAllListeners()
})

/** The next weekday: the seeded technicians work Monday to Friday. */
function workday(): string {
  let date = addDays(todayInTimeZone('Europe/Zagreb'), 1)
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addDays(date, 1)
  return date
}

async function request() {
  const date = workday()
  const [board, technicians] = await Promise.all([
    apiFetch<DispatchBoard>('/dispatch/board', { query: { date } }),
    apiFetch<Technician[]>('/technicians'),
  ])
  return {
    date,
    technicianIds: technicians.filter((t) => t.isActive).map((t) => t.id),
    jobIds: board.unassigned
      .filter((job) => job.status === 'new')
      .slice(0, 3)
      .map((job) => job.id),
  }
}

/** Cached data under dispatch and job keys, and one that is not job data. */
function seedCache(queryClient: ReturnType<typeof queryWrapper>['queryClient'], date: string) {
  queryClient.setQueryData(dispatchKeys.board(date), { columns: [] })
  queryClient.setQueryData(['jobs', 'list', { page: 1 }], { items: [] })
  queryClient.setQueryData(['job-types'], [])
}

describe('useOptimizeRoutePlan', () => {
  it('puts the draft in the plan cache and refetches the board, which reports it', async () => {
    const body = await request()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient, body.date)
    const { result } = renderHook(() => useOptimizeRoutePlan(), { wrapper })

    const plan = await act(() => result.current.mutateAsync(body))

    expect(plan.status).toBe('draft')
    expect(queryClient.getQueryData(dispatchKeys.plan(plan.id))).toEqual(plan)
    expect(isInvalidated(queryClient, dispatchKeys.board(body.date))).toBe(true)
    expect(isInvalidated(queryClient, ['job-types'])).toBe(false)
  })

  it('leaves 402 and 502 to the caller: the error carries the status', async () => {
    const body = await request()
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useOptimizeRoutePlan(), { wrapper })

    server.use(
      http.post(`${API}/route-plans/optimize`, () =>
        HttpResponse.json({ status: 502, title: 'Bad gateway' }, { status: 502 }),
      ),
    )
    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined)
    })
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(ApiError)
    })
    expect((result.current.error as ApiError).status).toBe(502)
  })

  it('trying again after a network error reuses the idempotency key', async () => {
    const body = await request()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request: sent }) => {
      if (sent.method === 'POST' && new URL(sent.url).pathname.endsWith('/route-plans/optimize')) {
        keys.push(sent.headers.get('Idempotency-Key'))
      }
    })
    let failures = 1
    server.use(
      http.post(`${API}/route-plans/optimize`, () =>
        failures-- > 0 ? HttpResponse.error() : undefined,
      ),
    )
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useOptimizeRoutePlan(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined)
    })
    await act(() => result.current.mutateAsync(body))

    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })
})

describe('useOptimizeRoutePlan keys', () => {
  it('a request that went through is done: the same choice made again is a new request', async () => {
    const body = await request()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request: sent }) => {
      if (sent.method === 'POST' && new URL(sent.url).pathname.endsWith('/route-plans/optimize')) {
        keys.push(sent.headers.get('Idempotency-Key'))
      }
    })
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useOptimizeRoutePlan(), { wrapper })

    await act(() => result.current.mutateAsync(body))
    await act(() => result.current.mutateAsync(body))

    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
  })
})

describe('useUpdateRoutePlan', () => {
  it('replaces the cached plan with the corrected one', async () => {
    const body = await request()
    const draft = await apiFetch<RoutePlan>('/route-plans/optimize', { method: 'POST', json: body })
    const route = draft.routes[0]
    if (!route) throw new Error('Seed needs a route')
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(dispatchKeys.plan(draft.id), draft)
    const { result } = renderHook(() => useUpdateRoutePlan(), { wrapper })

    const updated = await act(() =>
      result.current.mutateAsync({
        id: draft.id,
        routes: [
          { technicianId: route.technicianId, jobIds: route.stops.map((s) => s.jobId).reverse() },
        ],
      }),
    )

    expect(updated.routes[0]?.stops.map((s) => s.jobId)).toEqual(
      route.stops.map((s) => s.jobId).reverse(),
    )
    expect(queryClient.getQueryData(dispatchKeys.plan(draft.id))).toEqual(updated)
  })

  it('409: tells the user and refreshes the plan and the board', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.put(`${API}/route-plans/:id`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const date = workday()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient, date)
    const { result } = renderHook(() => useUpdateRoutePlan(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 'p', routes: [] }).catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledWith(
      'Plan je u međuvremenu promijenjen. Prikazani su najnoviji podaci.',
    )
    expect(isInvalidated(queryClient, dispatchKeys.board(date))).toBe(true)
  })
})

describe('usePublishRoutePlan', () => {
  it('caches the published plan and refreshes the board and all job data', async () => {
    const body = await request()
    const draft = await apiFetch<RoutePlan>('/route-plans/optimize', { method: 'POST', json: body })
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient, body.date)
    const { result } = renderHook(() => usePublishRoutePlan(), { wrapper })

    const published = await act(() => result.current.mutateAsync(draft.id))

    expect(published.status).toBe('published')
    expect(queryClient.getQueryData(dispatchKeys.plan(draft.id))).toEqual(published)
    expect(isInvalidated(queryClient, dispatchKeys.board(body.date))).toBe(true)
    expect(isInvalidated(queryClient, ['jobs', 'list', { page: 1 }])).toBe(true)
    expect(isInvalidated(queryClient, ['job-types'])).toBe(false)
  })

  it('409: tells the user and refreshes', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.post(`${API}/route-plans/:id/publish`, () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const date = workday()
    const { queryClient, wrapper } = queryWrapper()
    seedCache(queryClient, date)
    const { result } = renderHook(() => usePublishRoutePlan(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('p').catch(() => undefined)
    })

    expect(warning).toHaveBeenCalledOnce()
    expect(isInvalidated(queryClient, dispatchKeys.board(date))).toBe(true)
  })
})

describe('useGetRoutePlan', () => {
  it('reads a plan by id', async () => {
    const body = await request()
    const draft = await apiFetch<RoutePlan>('/route-plans/optimize', { method: 'POST', json: body })
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useGetRoutePlan(draft.id), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.id).toBe(draft.id)
    })
  })
})
