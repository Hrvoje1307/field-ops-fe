import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'
import { queryWrapper, signInForTest } from '@/shared/api/test/hook-test-utils'

import { useListCustomFieldDefinitions } from './api'

beforeEach(async () => {
  resetMockDb()
  await signInForTest('dispecer@alarmko.test')
})

describe('useListCustomFieldDefinitions', () => {
  it("the tenant's definitions for the scope, in display order", async () => {
    const { wrapper } = queryWrapper()
    const { result } = renderHook(() => useListCustomFieldDefinitions({ entity: 'job' }), {
      wrapper,
    })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.length).toBeGreaterThan(0)
    expect(result.current.data?.every((definition) => definition.entity === 'job')).toBe(true)
  })

  it('asks nothing while disabled, then loads once enabled', async () => {
    const requests: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).pathname.endsWith('/custom-fields')) requests.push(request.url)
    })
    const { wrapper } = queryWrapper()
    const { result, rerender } = renderHook(
      ({ enabled }) => useListCustomFieldDefinitions({ entity: 'client' }, { enabled }),
      { wrapper, initialProps: { enabled: false } },
    )
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(requests).toHaveLength(0)
    expect(result.current.fetchStatus).toBe('idle')

    rerender({ enabled: true })
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(requests).toHaveLength(1)
    server.events.removeAllListeners()
  })
})
