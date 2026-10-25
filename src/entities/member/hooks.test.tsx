import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  listInvitations,
  listMembers,
  useCreateInvitation,
  useListInvitations,
  useListMembers,
  useRevokeInvitation,
  useUpdateMember,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

const KEYS = [
  ['members'],
  ['members', 'invitations'],
  ['technicians', 'list'],
  ['dispatch', 'board'],
  ['skills'],
] as const
function seed(queryClient: ReturnType<typeof queryWrapper>['queryClient']) {
  for (const key of KEYS) queryClient.setQueryData(key, [])
}
const refreshed = (queryClient: ReturnType<typeof queryWrapper>['queryClient']) =>
  KEYS.map((key) => isInvalidated(queryClient, key))

describe('member hooks', () => {
  it('list the members and the open invitations', async () => {
    const { wrapper } = queryWrapper()
    const members = renderHook(() => useListMembers(), { wrapper })
    const invitations = renderHook(() => useListInvitations(), { wrapper })
    await waitFor(() => {
      expect(members.result.current.data?.length).toBeGreaterThan(1)
      expect(invitations.result.current.data).toBeDefined()
    })
  })

  it('changing a member refreshes the members, technicians and the board', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const dispatcher = (await listMembers()).find((m) => m.role === 'dispatcher')
    if (!dispatcher) throw new Error('Seed needs a dispatcher')
    const update = renderHook(() => useUpdateMember(), { wrapper })
    seed(queryClient)
    await act(async () => {
      await update.result.current.mutateAsync({
        userId: dispatcher.userId,
        body: { role: 'dispatcher', isActive: false },
      })
    })
    expect(refreshed(queryClient)).toEqual([true, true, true, true, false])
    expect((await listMembers()).find((m) => m.userId === dispatcher.userId)?.isActive).toBe(false)
  })

  it('the last active owner cannot be changed (409) and nothing refreshes', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const owner = (await listMembers()).find((m) => m.role === 'owner')
    if (!owner) throw new Error('Seed needs an owner')
    const update = renderHook(() => useUpdateMember(), { wrapper })
    seed(queryClient)
    let error: unknown
    await act(async () => {
      await update.result.current
        .mutateAsync({ userId: owner.userId, body: { role: 'dispatcher', isActive: true } })
        .catch((e: unknown) => {
          error = e
        })
    })
    expect((error as ApiError).status).toBe(409)
    expect(refreshed(queryClient)).toEqual([false, false, false, false, false])
  })

  it('inviting and revoking refresh the invitations, not the technicians', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const invite = renderHook(() => useCreateInvitation(), { wrapper })
    const revoke = renderHook(() => useRevokeInvitation(), { wrapper })
    seed(queryClient)
    let invitation = { id: '' }
    await act(async () => {
      invitation = await invite.result.current.mutateAsync({
        email: 'nova.osoba@firma.test',
        role: 'technician',
      })
    })
    expect(refreshed(queryClient)).toEqual([true, true, false, false, false])
    expect((await listInvitations()).map((i) => i.email)).toContain('nova.osoba@firma.test')

    seed(queryClient)
    await act(async () => {
      await revoke.result.current.mutateAsync(invitation.id)
    })
    expect(refreshed(queryClient)).toEqual([true, true, false, false, false])
    expect((await listInvitations()).map((i) => i.email)).not.toContain('nova.osoba@firma.test')
  })

  it('inviting someone who is a member or already invited is a 409', async () => {
    const { wrapper } = queryWrapper()
    const invite = renderHook(() => useCreateInvitation(), { wrapper })
    const [member] = await listMembers()
    const errors: unknown[] = []
    await act(async () => {
      await invite.result.current
        .mutateAsync({ email: member?.email ?? '', role: 'technician' })
        .catch((e: unknown) => errors.push(e))
      await invite.result.current
        .mutateAsync({ email: 'prva@firma.test', role: 'technician' })
        .catch((e: unknown) => errors.push(e))
      await invite.result.current
        .mutateAsync({ email: 'prva@firma.test', role: 'dispatcher' })
        .catch((e: unknown) => errors.push(e))
    })
    expect(errors).toHaveLength(2)
    expect(errors.map((e) => (e as ApiError).status)).toEqual([409, 409])
  })
})
