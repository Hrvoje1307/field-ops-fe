import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  getSalesBoard,
  listDeals,
  useAddDealNote,
  useConvertDeal,
  useCreateDeal,
  useGetDeal,
  useGetSalesBoard,
  useGetSalesToday,
  useListDealActivities,
  useMoveDeal,
  useUpdateDeal,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['deals', 'board'],
  ['mail-threads', 'list'],
  ['drafts', 'list'],
  ['mailboxes', 'list'],
  ['jobs', 'list'],
  ['clients', 'list'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

const stageIdOf = async (name: string) => {
  const board = await getSalesBoard({})
  const stage = board.columns.find((c) => c.stage.name === name)?.stage
  if (!stage) throw new Error(`No stage ${name}`)
  return stage.id
}

describe('moving on the board', () => {
  it('the card is in its new column while the request runs and goes back when it fails', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const board = renderHook(() => useGetSalesBoard(), { wrapper })
    await waitFor(() => {
      expect(board.result.current.data).toBeDefined()
    })
    const before = board.result.current.data
    const deal = before?.columns.find((c) => c.stage.kind === 'open' && c.deals.length > 0)
      ?.deals[0]
    const target = before?.columns.find(
      (c) => c.stage.kind === 'open' && c.stage.id !== deal?.stage.id,
    )
    if (!deal || !target) throw new Error('seed')
    const move = renderHook(() => useMoveDeal(), { wrapper })
    const key = ['deals', 'board', {}]

    // The server refuses: the board is put back
    server.use(
      http.post('http://localhost/api/v1/sales/deals/:id/move', async () => {
        await new Promise((resolve) => setTimeout(resolve, 400))
        return HttpResponse.json({ status: 500, title: 'Boom' }, { status: 500 })
      }),
    )
    let failed: Promise<unknown> = Promise.resolve()
    act(() => {
      failed = move.result.current
        .mutateAsync({ id: deal.id, body: { stageId: target.stage.id } })
        .catch((e: unknown) => e)
    })
    await waitFor(() => {
      const optimistic = queryClient.getQueryData<NonNullable<typeof before>>(key)
      expect(
        optimistic?.columns.find((c) => c.stage.id === target.stage.id)?.deals.map((d) => d.id),
      ).toContain(deal.id)
    })
    expect(await failed).toBeInstanceOf(ApiError)
    expect(queryClient.getQueryData(key)).toEqual(before)
  })
})

describe('deal queries', () => {
  it('board, Today, a deal and its timeline', async () => {
    const { wrapper } = queryWrapper()
    const board = renderHook(() => useGetSalesBoard(), { wrapper })
    const today = renderHook(() => useGetSalesToday(), { wrapper })
    await waitFor(() => {
      expect(board.result.current.data?.columns).toHaveLength(6)
      expect(today.result.current.data?.items.length).toBeGreaterThan(0)
    })
    const first = (await listDeals({})).items[0]
    const deal = renderHook(() => useGetDeal(first?.id ?? ''), { wrapper })
    const activities = renderHook(() => useListDealActivities(first?.id ?? ''), { wrapper })
    await waitFor(() => {
      expect(deal.result.current.data?.title).toBe(first?.title)
      expect(activities.result.current.data?.at(-1)?.type).toBe('created')
    })
  })
})

describe('deal mutations', () => {
  it('moving puts the returned deal in the cache and refreshes the board, conversations and drafts', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const deal = (await listDeals({ q: 'pekaru' })).items[0]
    const target = await stageIdOf('Kontaktiran')
    const move = renderHook(() => useMoveDeal(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await move.result.current.mutateAsync({ id: deal?.id ?? '', body: { stageId: target } })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, true, false, false])
    expect(
      queryClient.getQueryData<{ stage: { id: string } }>(['deals', 'detail', deal?.id])?.stage.id,
    ).toBe(target)
  })

  it('a lost stage without a reason is a 400 sales.lost_reason_required with errors.lostReason; no toast, nothing refreshes', async () => {
    const warning = vi.spyOn(toast, 'warning')
    const { queryClient, wrapper } = queryWrapper()
    const deal = (await listDeals({ q: 'pekaru' })).items[0]
    const lost = await stageIdOf('Izgubljen')
    const move = renderHook(() => useMoveDeal(), { wrapper })
    seed(queryClient)
    let error: unknown
    await act(async () => {
      await move.result.current
        .mutateAsync({ id: deal?.id ?? '', body: { stageId: lost } })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).problem).toMatchObject({ code: 'sales.lost_reason_required' })
    expect((error as ApiError).fieldErrors).toHaveProperty('lostReason')
    expect(refreshed(queryClient)).toEqual([false, false, false, false, false, false])
    expect(warning).not.toHaveBeenCalled()
  })

  it('409 (stale version): tells the user and refreshes the sales data', async () => {
    const warning = vi.spyOn(toast, 'warning')
    server.use(
      http.post('*/sales/deals/:id/move', () =>
        HttpResponse.json({ status: 409, title: 'Conflict' }, { status: 409 }),
      ),
    )
    const { queryClient, wrapper } = queryWrapper()
    const deal = (await listDeals({})).items[0]
    const move = renderHook(() => useMoveDeal(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await move.result.current
        .mutateAsync({
          id: deal?.id ?? '',
          body: { stageId: await stageIdOf('Kontaktiran'), version: 99 },
        })
        .catch(() => undefined)
    })
    expect(warning).toHaveBeenCalledWith(
      'Prilika je u međuvremenu promijenjena. Prikazani su najnoviji podaci.',
    )
    expect(refreshed(queryClient).slice(0, 4)).toEqual([true, true, true, true])
  })

  it('editing sends the version; a stale one is a 409 that refreshes', async () => {
    const warning = vi.spyOn(toast, 'warning')
    const { queryClient, wrapper } = queryWrapper()
    const summary = (await listDeals({})).items[0]
    const deal = renderHook(() => useGetDeal(summary?.id ?? ''), { wrapper })
    await waitFor(() => {
      expect(deal.result.current.data).toBeDefined()
    })
    const current = deal.result.current.data
    const update = renderHook(() => useUpdateDeal(), { wrapper })
    await act(async () => {
      await update.result.current.mutateAsync({
        id: current?.id ?? '',
        body: { title: 'Novi naslov', version: current?.version ?? 0 },
      })
    })
    expect(
      queryClient.getQueryData<{ title: string }>(['deals', 'detail', current?.id])?.title,
    ).toBe('Novi naslov')
    seed(queryClient)
    await act(async () => {
      await update.result.current
        .mutateAsync({
          id: current?.id ?? '',
          body: { title: 'Opet', version: current?.version ?? 0 },
        })
        .catch(() => undefined)
    })
    expect(warning).toHaveBeenCalled()
    expect(refreshed(queryClient).slice(0, 4)).toEqual([true, true, true, true])
  })

  it('creating and noting: the new deal is in the cache, a note refreshes the deals', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateDeal(), { wrapper })
    let id = ''
    await act(async () => {
      id = (await create.result.current.mutateAsync({ title: 'Nova prilika' })).id
    })
    expect(queryClient.getQueryData<{ title: string }>(['deals', 'detail', id])?.title).toBe(
      'Nova prilika',
    )
    const note = renderHook(() => useAddDealNote(), { wrapper })
    await act(async () => {
      await note.result.current.mutateAsync({ id, body: { text: 'Zvati' } })
    })
    expect(note.result.current.data?.type).toBe('note')
  })

  it('converting refreshes the sales data and the job data (the client and the job are new); a second time is 409', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
    const deal = (await listDeals({ q: 'Dojava' })).items[0]
    const client = t?.clients.find((c) => c.name === 'Dječji vrtić Sunčica')
    const jobType = t?.jobTypes.find((jt) => jt.isActive)
    const convert = renderHook(() => useConvertDeal(), { wrapper })
    seed(queryClient)
    const body = { clientId: client?.id, job: { jobTypeId: jobType?.id ?? '', title: 'Nalog' } }
    await act(async () => {
      await convert.result.current.mutateAsync({ id: deal?.id ?? '', body })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, true, true, true])
    let error: unknown
    await act(async () => {
      await convert.result.current
        .mutateAsync({ id: deal?.id ?? '', body: { ...body, markWon: false } })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).problem).toMatchObject({ code: 'sales.deal_already_converted' })
  })
})
