import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useListChecklistTemplates,
  useUpdateChecklistTemplate,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [['checklist-templates'], ['job-types'], ['jobs', 'list'], ['skills']] as const

function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('checklist template hooks', () => {
  it('list the templates', async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListChecklistTemplates(), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.length).toBeGreaterThan(0)
    })
  })

  it('create, change and delete refresh the templates and the job types that point at them', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const create = renderHook(() => useCreateChecklistTemplate(), { wrapper })
    const update = renderHook(() => useUpdateChecklistTemplate(), { wrapper })
    const remove = renderHook(() => useDeleteChecklistTemplate(), { wrapper })
    const all = [true, true, false, false]

    seed(queryClient)
    let created = { id: '' }
    await act(async () => {
      created = await create.result.current.mutateAsync({
        name: 'Nova',
        items: [{ label: 'Prva' }],
      })
    })
    expect(refreshed(queryClient)).toEqual(all)

    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: created.id,
        body: { name: 'Nova 2', items: [{ label: 'Druga', required: true }] },
      })
    })
    expect(refreshed(queryClient)).toEqual(all)
    expect(
      (await listChecklistTemplates()).find((template) => template.id === created.id)?.items,
    ).toEqual([{ label: 'Druga', required: true }])

    seed(queryClient)
    await act(async () => {
      await remove.result.current.mutateAsync(created.id)
    })
    expect(refreshed(queryClient)).toEqual(all)
  })
})
