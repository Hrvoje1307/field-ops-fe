import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { isInvalidated, queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import {
  getSalesSettings,
  useCreateExclusionRule,
  useCreateFollowUpRule,
  useDeleteExclusionRule,
  useDeleteFollowUpRule,
  useGetSalesSettings,
  useListExclusionRules,
  useListFollowUpRules,
  useUpdateFollowUpRule,
  useUpdateSalesSettings,
} from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('sales config hooks', () => {
  it('read the settings, the rules and the exclusions', async () => {
    const { wrapper } = queryWrapper()
    const settings = renderHook(() => useGetSalesSettings(), { wrapper })
    const rules = renderHook(() => useListFollowUpRules(), { wrapper })
    const exclusions = renderHook(() => useListExclusionRules(), { wrapper })
    await waitFor(() => {
      expect(settings.result.current.data?.tone).toBe('neutral')
      expect(rules.result.current.data).toHaveLength(2)
      expect(exclusions.result.current.data).toHaveLength(2)
    })
  })

  it('saving the settings puts them in the cache and refreshes the sales data (the threshold decides the review list)', async () => {
    const { queryClient, wrapper } = queryWrapper()
    const settings = await getSalesSettings()
    const update = renderHook(() => useUpdateSalesSettings(), { wrapper })
    queryClient.setQueryData(['mail-threads', 'list'], [])
    await act(async () => {
      await update.result.current.mutateAsync({ ...settings, reviewThreshold: 0.9 })
    })
    expect(
      queryClient.getQueryData<{ reviewThreshold: number }>(['sales-config', 'settings'])
        ?.reviewThreshold,
    ).toBe(0.9)
    expect(isInvalidated(queryClient, ['mail-threads', 'list'])).toBe(true)
  })

  it('rules: create, edit, delete; 400 for days outside 1–90 with the field', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateFollowUpRule(), { wrapper })
    let id = ''
    await act(async () => {
      id = (
        await create.result.current.mutateAsync({
          name: 'Nova',
          daysWithoutReply: 2,
          createDraft: false,
          isActive: true,
        })
      ).id
    })
    const update = renderHook(() => useUpdateFollowUpRule(), { wrapper })
    await act(async () => {
      await update.result.current.mutateAsync({
        id,
        body: { name: 'Nova 2', daysWithoutReply: 3, createDraft: true, isActive: true },
      })
    })
    expect(update.result.current.data).toMatchObject({ name: 'Nova 2', daysWithoutReply: 3 })
    const bad = await create.result.current
      .mutateAsync({ name: 'Loša', daysWithoutReply: 0, createDraft: false, isActive: true })
      .catch((e: unknown) => e)
    expect((bad as ApiError).fieldErrors).toHaveProperty('daysWithoutReply')
    const remove = renderHook(() => useDeleteFollowUpRule(), { wrapper })
    await act(async () => {
      await remove.result.current.mutateAsync(id)
    })
    expect(remove.result.current.isSuccess).toBe(true)
  })

  it('exclusions: create (lower-cased) and delete', async () => {
    const { wrapper } = queryWrapper()
    const create = renderHook(() => useCreateExclusionRule(), { wrapper })
    await act(async () => {
      await create.result.current.mutateAsync({ pattern: '@Firma.test' })
    })
    expect(create.result.current.data?.pattern).toBe('@firma.test')
    const remove = renderHook(() => useDeleteExclusionRule(), { wrapper })
    await act(async () => {
      await remove.result.current.mutateAsync(create.result.current.data?.id ?? '')
    })
    expect(remove.result.current.isSuccess).toBe(true)
  })
})
