import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { listTechnicians, useCreateTechnician, useUpdateTechnician } from './api'
import {
  technicianFormValues,
  toTechnicianBody,
  toTechnicianCreateBody,
} from './model/technician-form'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['technicians', 'list', {}],
  ['dispatch', 'board', 'x'],
  ['jobs', 'list'],
  ['members'],
  ['skills'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('technician write hooks', () => {
  it('changing a technician refreshes technicians, the board, jobs and the members', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const [technician] = await listTechnicians({})
    if (!technician) throw new Error('Seed needs technicians')
    const update = renderHook(() => useUpdateTechnician(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        id: technician.id,
        body: toTechnicianBody({ ...technicianFormValues(technician), workEnd: '23:00' }),
      })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, true, false])
    expect((await listTechnicians({})).find((t) => t.id === technician.id)?.workEnd).toBe('23:00')
  })

  it('an end before the start is a 400 on the end', async () => {
    const { wrapper } = queryWrapper()
    const [technician] = await listTechnicians({})
    if (!technician) throw new Error('Seed needs technicians')
    const update = renderHook(() => useUpdateTechnician(), { wrapper })
    let error: unknown
    await act(async () => {
      await update.result.current
        .mutateAsync({
          id: technician.id,
          body: toTechnicianBody({
            ...technicianFormValues(technician),
            workStart: '16:00',
            workEnd: '08:00',
          }),
        })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(400)
    expect(Object.keys((error as ApiError).fieldErrors)).toEqual(['workEnd'])
  })

  it('a user who is not a technician member cannot get technician data (400 on the user)', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateTechnician(), { wrapper })
    let error: unknown
    await act(async () => {
      await create.result.current
        .mutateAsync(
          toTechnicianCreateBody('00000000-0000-4000-8000-000000000000', technicianFormValues()),
        )
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(400)
    expect(Object.keys((error as ApiError).fieldErrors)).toEqual(['userId'])
  })
})
