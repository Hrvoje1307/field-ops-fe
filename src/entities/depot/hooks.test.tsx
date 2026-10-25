import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { listDepots, useCreateDepot, useDeleteDepot, useListDepots, useUpdateDepot } from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const input = {
  name: 'Novo skladište',
  address: 'Ulica 1, Zagreb',
  opensAt: '07:00',
  closesAt: '15:00',
  lat: null,
  lng: null,
}

function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of [['depots'], ['technicians', 'list'], ['dispatch', 'board']]) {
    queryClient.setQueryData(key, [])
  }
  queryClient.setQueryData(['skills'], [])
}

const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) => ({
  depots: isInvalidated(queryClient, ['depots']),
  technicians: isInvalidated(queryClient, ['technicians', 'list']),
  board: isInvalidated(queryClient, ['dispatch', 'board']),
  skills: isInvalidated(queryClient, ['skills']),
})

describe('depot hooks', () => {
  it('list the depots', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListDepots(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.length).toBeGreaterThan(0)
    })
  })

  it('create, change and delete refresh depots and what is worked out from them', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateDepot(), { wrapper })
    const update = renderHook(() => useUpdateDepot(), { wrapper })
    const remove = renderHook(() => useDeleteDepot(), { wrapper })
    const all = { depots: true, technicians: true, board: true, skills: false }

    seed(queryClient)
    let created = { id: '' }
    await act(async () => {
      created = await create.result.current.mutateAsync(input)
    })
    expect(refreshed(queryClient)).toEqual(all)

    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: created.id,
        body: { ...input, closesAt: '16:00' },
      })
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect((await listDepots()).find((depot) => depot.id === created.id)?.closesAt).toBe('16:00')

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
  })

  it('a depot technicians start from cannot be deleted (409) and nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const depots = await listDepots()
    seed(queryClient)
    const remove = renderHook(() => useDeleteDepot(), { wrapper })
    let error: unknown
    await act(async () => {
      await remove.result.current.mutateAsync(depots[0]?.id ?? '').catch((e: unknown) => {
        error = e
      })
    })
    expect((error as ApiError).status).toBe(409)
    expect(refreshed(queryClient)).toEqual({
      depots: false,
      technicians: false,
      board: false,
      skills: false,
    })
  })
})
