import { describe, expect, it } from 'vitest'

import { authKeys } from '@/entities/auth'
import { ApiError } from '@/shared/api/api-error'

import { createAppQueryClient, isSalesAccessLost } from './query-client'

const fail = (status: number, code?: string) =>
  new ApiError(status, { status, title: 'x', ...(code ? { code } : {}) })

describe('isSalesAccessLost', () => {
  it('is the two 403 codes of the Sales tag and nothing else', () => {
    expect(isSalesAccessLost(fail(403, 'sales.forbidden'))).toBe(true)
    expect(isSalesAccessLost(fail(403, 'sales.not_enabled'))).toBe(true)
    expect(isSalesAccessLost(fail(403, 'auth.forbidden'))).toBe(false)
    expect(isSalesAccessLost(fail(403))).toBe(false)
    expect(isSalesAccessLost(fail(409, 'sales.forbidden'))).toBe(false)
    expect(isSalesAccessLost(new Error('network'))).toBe(false)
  })
})

describe('the app’s query client', () => {
  const run = async (error: unknown) => {
    const client = createAppQueryClient()
    client.setQueryData(authKeys.me, { role: 'dispatcher' })
    await client
      .query({
        queryKey: ['deals', 'today', {}],
        queryFn: () => Promise.reject(error as Error),
        retry: false,
      })
      .catch(() => undefined)
    return client.getQueryState(authKeys.me)?.isInvalidated ?? false
  }

  it('reads /me again when a sales request says the access is gone', async () => {
    expect(await run(fail(403, 'sales.forbidden'))).toBe(true)
    expect(await run(fail(403, 'sales.not_enabled'))).toBe(true)
  })

  it('leaves /me alone for any other failure', async () => {
    expect(await run(fail(500))).toBe(false)
    expect(await run(fail(403, 'auth.forbidden'))).toBe(false)
  })
})
