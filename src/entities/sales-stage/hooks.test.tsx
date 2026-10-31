import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listSalesStages,
  useCreateSalesStage,
  useDeleteSalesStage,
  useListSalesStages,
  useReorderSalesStages,
  useUpdateSalesStage,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['sales-stages', 'list'],
  ['deals', 'board'],
  ['sales-config', 'follow-up-rules'],
  ['mail-threads', 'list'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('sales stage hooks', () => {
  it('list the stages in board order; the tenant’s own names come from the API', async () => {
    const { wrapper } = queryWrapper()
    const list = renderHook(() => useListSalesStages(), { wrapper })
    await waitFor(() => {
      expect(list.result.current.data?.map((s) => s.kind)).toEqual([
        'open',
        'open',
        'open',
        'open',
        'won',
        'lost',
      ])
    })
    expect(list.result.current.data?.[0]?.name).toBe('Novi upit')
  })

  it('changing stages refreshes the stages, the board and the rules', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateSalesStage(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await create.result.current.mutateAsync({
        name: 'Odluka',
        color: '#0ea5e9',
        kind: 'open',
        isActive: true,
      })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, false])

    const stages = await listSalesStages({})
    const reorder = renderHook(() => useReorderSalesStages(), { wrapper })
    await act(async () => {
      await reorder.result.current.mutateAsync({ stageIds: stages.map((s) => s.id).reverse() })
    })
    expect((await listSalesStages({})).map((s) => s.id)).toEqual(stages.map((s) => s.id).reverse())
  })

  it('409 sales.stage_required and sales.stage_in_use reach the caller with their codes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const stages = await listSalesStages({})
    const won = stages.find((s) => s.kind === 'won')
    const offer = stages.find((s) => s.name === 'Ponuda poslana')
    if (!won || !offer) throw new Error('seed')
    const update = renderHook(() => useUpdateSalesStage(), { wrapper })
    const remove = renderHook(() => useDeleteSalesStage(), { wrapper })
    seed(queryClient)
    const required = await update.result.current
      .mutateAsync({ id: won.id, body: { ...won, kind: 'open' } })
      .catch((e: unknown) => e)
    expect((required as ApiError).status).toBe(409)
    expect((required as ApiError).problem).toMatchObject({ code: 'sales.stage_required' })
    const inUse = await remove.result.current.mutateAsync(offer.id).catch((e: unknown) => e)
    expect((inUse as ApiError).problem).toMatchObject({ code: 'sales.stage_in_use' })
    expect(refreshed(queryClient)).toEqual([false, false, false, false])
  })
})
