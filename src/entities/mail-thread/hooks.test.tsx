import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { MOCK_AI_MONTHLY_LIMIT } from '@/shared/api/mocks/lib/sales/const'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listMailThreads,
  useGetMailThread,
  useLinkMailThread,
  useListMailThreads,
  useReprocessMailThread,
  useUpdateThreadClassification,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['mail-threads', 'list'],
  ['deals', 'board'],
  ['sales-config', 'exclusions'],
  ['jobs', 'list'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('mail thread hooks', () => {
  it('the inbox cards are query parameters', async () => {
    const { wrapper } = queryWrapper()
    const sales = renderHook(() => useListMailThreads({ isSales: true, pageSize: 100 }), {
      wrapper,
    })
    const review = renderHook(() => useListMailThreads({ needsReview: true }), { wrapper })
    await waitFor(() => {
      expect(sales.result.current.data?.items.length).toBeGreaterThan(5)
      expect(review.result.current.data?.items.length).toBeGreaterThan(0)
    })
    expect(review.result.current.data?.items.every((t) => t.needsReview)).toBe(true)
  })

  it('the thread comes with its messages and drafts', async () => {
    const { wrapper } = queryWrapper()
    const first = (await listMailThreads({ isSales: true })).items[0]
    const thread = renderHook(() => useGetMailThread(first?.id ?? ''), { wrapper })
    await waitFor(() => {
      expect(thread.result.current.data?.messages.length).toBeGreaterThan(0)
    })
  })

  it('a correction refreshes the inbox and everything that shows conversations', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const first = (await listMailThreads({ isSales: true })).items[0]
    const update = renderHook(() => useUpdateThreadClassification(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: first?.id ?? '',
        body: { category: 'support', isSales: false },
      })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, false])
  })

  it('linking without dealId or createDeal is a 400 and nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const first = (await listMailThreads({ isSales: true })).items[0]
    const link = renderHook(() => useLinkMailThread(), { wrapper })
    seed(queryClient)
    let error: unknown
    await act(async () => {
      await link.result.current
        .mutateAsync({ id: first?.id ?? '', body: {} })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(400)
    expect(refreshed(queryClient)).toEqual([false, false, false, false])
  })

  it('reprocess answers 202; AI off is a 409 sales.ai_disabled; over the allowance a 429 with Retry-After in seconds', async () => {
    const { wrapper } = queryWrapper()
    const first = (await listMailThreads({ isSales: true })).items[0]
    const id = first?.id ?? ''
    const reprocess = renderHook(() => useReprocessMailThread(), { wrapper })
    await act(async () => {
      await reprocess.result.current.mutateAsync(id)
    })
    expect(reprocess.result.current.isSuccess).toBe(true)

    const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
    if (!t) throw new Error('seed')
    t.sales.settings.aiEnabled = false
    const off = await reprocess.result.current.mutateAsync(id).catch((e: unknown) => e)
    expect((off as ApiError).problem).toMatchObject({ code: 'sales.ai_disabled' })

    t.sales.settings.aiEnabled = true
    const usage = t.usage.at(-1)
    if (usage) usage.aiClassifications = MOCK_AI_MONTHLY_LIMIT
    const over = await reprocess.result.current.mutateAsync(id).catch((e: unknown) => e)
    expect((over as ApiError).status).toBe(429)
    expect((over as ApiError).problem).toMatchObject({ code: 'sales.ai_quota_exceeded' })
    expect((over as ApiError).retryAfter).toBeGreaterThan(0)
  })
})
