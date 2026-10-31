import { describe, expect, it } from 'vitest'

import { readOAuthReturn } from './oauth-return'

describe('readOAuthReturn', () => {
  it('reads a connected mailbox', () => {
    expect(readOAuthReturn({ connected: 'abc' })).toEqual({ kind: 'connected', mailboxId: 'abc' })
  })
  it('knows the four codes of the spec', () => {
    for (const code of ['access_denied', 'wrong_account', 'already_connected', 'provider_error']) {
      expect(readOAuthReturn({ error: code })).toEqual({ kind: 'error', code })
    }
  })
  it('an unknown code is an error without a known code', () => {
    expect(readOAuthReturn({ error: 'brand_new' })).toEqual({ kind: 'error', code: null })
  })
  it('an error wins; nothing in the address is no return', () => {
    expect(readOAuthReturn({ connected: 'a', error: 'access_denied' })).toMatchObject({
      kind: 'error',
    })
    expect(readOAuthReturn({})).toBeNull()
  })
})
