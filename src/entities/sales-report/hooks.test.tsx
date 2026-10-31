import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { useGetSalesReport } from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('vlasnik@alarmko.test')
})

describe('useGetSalesReport', () => {
  it('reads the report for a range of dates', async () => {
    const { wrapper } = queryWrapper()
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    const report = renderHook(() => useGetSalesReport({ from, to }), { wrapper })
    await waitFor(() => {
      expect(report.result.current.data).toMatchObject({ from, to, dealsCreated: 10 })
    })
  })

  it('a range that ends before it starts is a 400', async () => {
    const { wrapper } = queryWrapper()
    const report = renderHook(() => useGetSalesReport({ from: '2026-10-10', to: '2026-10-01' }), {
      wrapper,
    })
    await waitFor(() => {
      expect(report.result.current.isError).toBe(true)
    })
  })
})
