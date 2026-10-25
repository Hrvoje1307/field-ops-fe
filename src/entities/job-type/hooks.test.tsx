import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listJobTypes,
  useCreateJobType,
  useDeleteJobType,
  useListJobTypes,
  useUpdateJobType,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const input = {
  name: 'Novi posao',
  color: '#0f766e',
  defaultDurationMin: 45,
  requiredPeople: 1,
  requiredSkillIds: [],
  checklistTemplateId: null,
  smsEnabled: true,
  isActive: true,
}

const KEYS = [
  ['job-types'],
  ['jobs', 'list'],
  ['clients', 'detail', 'x'],
  ['dispatch', 'board'],
  ['skills'],
] as const

function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('job type hooks', () => {
  it('list the job types', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListJobTypes(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.length).toBeGreaterThan(0)
    })
  })

  it('create, change and delete refresh the types and what shows them', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateJobType(), { wrapper })
    const update = renderHook(() => useUpdateJobType(), { wrapper })
    const remove = renderHook(() => useDeleteJobType(), { wrapper })
    const all = [true, true, true, true, false]

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
        body: { ...input, isActive: false },
      })
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect((await listJobTypes()).find((type) => type.id === created.id)?.isActive).toBe(false)

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
  })

  it('a type with jobs cannot be deleted (409) and nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const [used] = await listJobTypes()
    seed(queryClient)
    const remove = renderHook(() => useDeleteJobType(), { wrapper })
    let error: unknown
    await act(async () => {
      await remove.result.current.mutateAsync(used?.id ?? '').catch((e: unknown) => {
        error = e
      })
    })
    expect((error as ApiError).status).toBe(409)
    expect(refreshed(queryClient)).toEqual([false, false, false, false, false])
  })

  it('a skill that does not exist is a 400 on that skill', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateJobType(), { wrapper })
    let error: unknown
    await act(async () => {
      await create.result.current
        .mutateAsync({ ...input, requiredSkillIds: ['00000000-0000-4000-8000-000000000000'] })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(400)
    expect(Object.keys((error as ApiError).fieldErrors)).toEqual(['requiredSkillIds[0]'])
  })

  it('the same save tried again carries the same idempotency key', async () => {
    const { wrapper } = queryWrapper()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') keys.push(request.headers.get('Idempotency-Key'))
    })
    const create = renderHook(() => useCreateJobType(), { wrapper })
    const bad = { ...input, requiredSkillIds: ['00000000-0000-4000-8000-000000000000'] }
    await act(async () => {
      await create.result.current.mutateAsync(bad).catch(() => undefined)
      await create.result.current.mutateAsync(bad).catch(() => undefined)
    })
    expect(keys[0]).toBeTruthy()
    expect(keys[0]).toBe(keys[1])
  })
})
