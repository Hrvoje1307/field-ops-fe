import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { apiFetch } from '@/shared/api/api-fetch'
import type { Message } from '@/shared/api/generated/model'
import { getDb, resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  getPublicJob,
  linkProblem,
  publicJobKeys,
  useConfirmPublicJob,
  useGetPublicJob,
  useRequestPublicReschedule,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

/** The token of a job whose client has been sent a message, as the link in it carries it. */
async function aToken(): Promise<string> {
  const t = Object.values(getDb().tenants).find((x) => x.tenant.slug === 'alarmko')
  const job = t?.jobs.find(
    (j) =>
      j.status === 'scheduled' &&
      j.scheduledDate &&
      j.scheduledStart &&
      !j.rescheduleRequestedAt &&
      t.contacts.some((c) => c.clientId === j.clientId && c.phone && c.receivesSms),
  )
  if (!job) throw new Error('Seed needs a scheduled job with a time')
  const sent = await apiFetch<Message[]>(`/jobs/${job.id}/notify`, {
    method: 'POST',
    json: { channel: 'sms', templateKey: 'on_the_way' },
  })
  const link = /\/p\/(pub_\w+)/.exec(sent[0]?.body ?? '')
  if (!link?.[1]) throw new Error('No link in the message')
  return link[1]
}

describe('public job hooks', () => {
  it('read the page for a link, with no sign-in', async () => {
    const token = await aToken()
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useGetPublicJob(token), { wrapper })
    await waitFor(() => {
      expect(result.current.data?.canConfirm).toBe(true)
    })
  })

  it('tell a link that is wrong from one that has run out, and do not try again', async () => {
    const { wrapper } = queryWrapper()
    const wrong = renderHook(() => useGetPublicJob('pub_nothing'), { wrapper })
    await waitFor(() => {
      expect(wrong.result.current.isError).toBe(true)
    })
    expect(linkProblem(wrong.result.current.error)).toBe('not_found')

    const token = await aToken()
    for (const t of Object.values(getDb().tenants)) {
      for (const job of t.jobs)
        if (job.publicToken === token) job.publicTokenExpiresAt = '2020-01-01T00:00:00Z'
    }
    await expect(getPublicJob(token)).rejects.toSatisfy((e) => linkProblem(e) === 'gone')
    expect(linkProblem(new Error('x'))).toBeNull()
    expect(linkProblem(new ApiError(500, { status: 500, title: 'x' }))).toBeNull()
  })

  it('confirming puts the new state of the page in the cache', async () => {
    const token = await aToken()
    const { queryClient, wrapper } = queryWrapper()
    const confirm = renderHook(() => useConfirmPublicJob(token), { wrapper })
    await act(async () => {
      await confirm.result.current.mutateAsync()
    })
    expect(queryClient.getQueryData(publicJobKeys.detail(token))).toMatchObject({
      status: 'confirmed',
      canConfirm: false,
    })
  })

  it('a job that cannot be confirmed is a 409, and the page is read again', async () => {
    const token = await aToken()
    for (const t of Object.values(getDb().tenants)) {
      for (const job of t.jobs) if (job.publicToken === token) job.status = 'en_route'
    }
    const { queryClient, wrapper } = queryWrapper()
    queryClient.setQueryData(publicJobKeys.detail(token), { stale: true })
    const confirm = renderHook(() => useConfirmPublicJob(token), { wrapper })
    let error: unknown
    await act(async () => {
      await confirm.result.current.mutateAsync().catch((e: unknown) => {
        error = e
      })
    })
    expect((error as ApiError).status).toBe(409)
    expect(queryClient.getQueryState(publicJobKeys.detail(token))?.isInvalidated).toBe(true)
  })

  it('asking for another time puts the new state in the cache', async () => {
    const token = await aToken()
    const { queryClient, wrapper } = queryWrapper()
    const ask = renderHook(() => useRequestPublicReschedule(token), { wrapper })
    await act(async () => {
      await ask.result.current.mutateAsync({ note: 'Poslije podne.' })
    })
    expect(queryClient.getQueryData(publicJobKeys.detail(token))).toMatchObject({
      status: 'reschedule_requested',
      canRequestReschedule: false,
    })
  })
})
