import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { listSkills, useCreateSkill, useDeleteSkill, useListSkills, useUpdateSkill } from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

/** Caches standing in for what a skill shows up in. */
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of [['skills'], ['job-types'], ['technicians', 'list'], ['dispatch', 'board']]) {
    queryClient.setQueryData(key, [])
  }
  queryClient.setQueryData(['clients', 'list'], [])
  queryClient.setQueryData(['tenant'], {})
}

const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) => ({
  skills: isInvalidated(queryClient, ['skills']),
  jobTypes: isInvalidated(queryClient, ['job-types']),
  technicians: isInvalidated(queryClient, ['technicians', 'list']),
  board: isInvalidated(queryClient, ['dispatch', 'board']),
  tenant: isInvalidated(queryClient, ['tenant']),
})

describe('skill hooks', () => {
  it('list the skills', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListSkills(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.length).toBeGreaterThan(0)
    })
  })

  it('create, rename and delete refresh what shows skills, and not what does not', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateSkill(), { wrapper })
    const update = renderHook(() => useUpdateSkill(), { wrapper })
    const remove = renderHook(() => useDeleteSkill(), { wrapper })
    const all = { skills: true, jobTypes: true, technicians: true, board: true, tenant: false }

    seed(queryClient)
    let created = { id: '' }
    await act(async () => {
      created = await create.result.current.mutateAsync({ name: 'Zavarivanje' })
    })
    expect(refreshed(queryClient)).toEqual(all)

    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({ id: created.id, body: { name: 'Lemljenje' } })
    })
    expect(refreshed(queryClient)).toEqual(all)

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect((await listSkills()).some((skill) => skill.id === created.id)).toBe(false)
  })

  it('a duplicate name is a 409, and refreshes nothing', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const [first] = await listSkills()
    seed(queryClient)
    const create = renderHook(() => useCreateSkill(), { wrapper })
    let error: unknown
    await act(async () => {
      await create.result.current.mutateAsync({ name: first?.name ?? '' }).catch((e: unknown) => {
        error = e
      })
    })
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect(refreshed(queryClient).skills).toBe(false)
  })

  it('the same save tried again carries the same idempotency key, a different one a new key', async () => {
    const { wrapper } = queryWrapper()
    const keys: (string | null)[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') keys.push(request.headers.get('Idempotency-Key'))
    })
    const [first] = await listSkills()
    const create = renderHook(() => useCreateSkill(), { wrapper })
    await act(async () => {
      for (const name of [first?.name ?? '', first?.name ?? '', 'Nova vještina']) {
        await create.result.current.mutateAsync({ name }).catch(() => undefined)
      }
    })
    expect(keys).toHaveLength(3)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })
})
