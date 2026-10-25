import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listEntityCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
  useUpdateCustomField,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const input = {
  entity: 'job' as const,
  assetTypeId: null,
  key: 'novo_polje',
  label: 'Novo polje',
  type: 'text' as const,
  options: null,
  required: false,
  isSensitive: false,
  sortOrder: 990,
}

const KEYS = [
  ['custom-fields', 'entity', 'job'],
  ['custom-fields', { entity: 'job' }],
  ['jobs', 'detail', 'x'],
  ['clients', 'detail', 'x'],
  ['assets', 'detail', 'x'],
  ['skills'],
] as const

function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('custom field definition hooks', () => {
  it('create, change and delete refresh the definitions and the pages that show values', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateCustomField(), { wrapper })
    const update = renderHook(() => useUpdateCustomField(), { wrapper })
    const remove = renderHook(() => useDeleteCustomField(), { wrapper })
    const all = [true, true, true, true, true, false]

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
        body: { ...input, label: 'Preimenovano', required: true },
      })
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect((await listEntityCustomFields('job')).find((f) => f.id === created.id)).toMatchObject({
      label: 'Preimenovano',
      required: true,
    })

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
  })

  it('lists an entity’s definitions in display order', async () => {
    const list = await listEntityCustomFields('job')
    const orders = list.map((field) => field.sortOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('a key that exists is a 409 and a changed key or type is a 422; nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const [existing] = await listEntityCustomFields('job')
    if (!existing) throw new Error('Seed needs job fields')
    seed(queryClient)
    const create = renderHook(() => useCreateCustomField(), { wrapper })
    const update = renderHook(() => useUpdateCustomField(), { wrapper })
    const errors: unknown[] = []
    await act(async () => {
      await create.result.current
        .mutateAsync({ ...input, key: existing.key })
        .catch((e: unknown) => errors.push(e))
      await update.result.current
        .mutateAsync({ id: existing.id, body: { ...input, key: 'drugi_kljuc' } })
        .catch((e: unknown) => errors.push(e))
    })
    expect(errors.map((e) => (e as ApiError).status)).toEqual([409, 422])
    expect(refreshed(queryClient)).toEqual([false, false, false, false, false, false])
  })
})
