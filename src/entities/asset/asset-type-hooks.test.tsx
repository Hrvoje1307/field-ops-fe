import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { listAssetTypes, useCreateAssetType, useDeleteAssetType, useUpdateAssetType } from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['asset-types'],
  ['assets', 'detail', 'x'],
  ['clients', 'detail', 'x'],
  ['custom-fields', {}],
  ['skills'],
] as const

function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}

const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('equipment type hooks', () => {
  it('create, change and delete refresh the types, equipment, clients and custom fields', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateAssetType(), { wrapper })
    const update = renderHook(() => useUpdateAssetType(), { wrapper })
    const remove = renderHook(() => useDeleteAssetType(), { wrapper })
    const all = [true, true, true, true, false]

    seed(queryClient)
    let created = { id: '' }
    await act(async () => {
      created = await create.result.current.mutateAsync({ name: 'Bojler', icon: null })
    })
    expect(refreshed(queryClient)).toEqual(all)

    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: created.id,
        body: { name: 'Bojler 2', icon: 'flame' },
      })
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect((await listAssetTypes()).find((type) => type.id === created.id)).toMatchObject({
      name: 'Bojler 2',
      icon: 'flame',
    })

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
  })

  it('a type that equipment still has cannot be deleted (409) and nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const types = await listAssetTypes()
    seed(queryClient)
    const remove = renderHook(() => useDeleteAssetType(), { wrapper })
    const errors: unknown[] = []
    for (const type of types) {
      await act(async () => {
        await remove.result.current.mutateAsync(type.id).catch((e: unknown) => errors.push(e))
      })
      if (errors.length > 0) break
    }
    expect((errors[0] as ApiError).status).toBe(409)
    expect(refreshed(queryClient)).toEqual([false, false, false, false, false])
  })
})
