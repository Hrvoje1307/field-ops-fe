import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Me, ProblemDetails, TokenResponse } from '@/shared/api/generated/model'

import { getDb, resetMockDb } from '../db'
import { decodeAccessToken } from '../lib/auth'
import { api, loginAs, PASSWORD, sessionFor, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

afterEach(() => {
  vi.useRealTimers()
})

const login = (email: string, password = PASSWORD, tenantId?: string) =>
  api<TokenResponse & ProblemDetails>('post', '/auth/login', {
    body: { email, password, ...(tenantId ? { tenantId } : {}) },
  })

const refresh = (refreshToken: string) =>
  api<TokenResponse & ProblemDetails>('post', '/auth/refresh', { body: { refreshToken } })

/** Moves the clock (Date only) forward. */
function advanceClock(ms: number) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(Date.now() + ms))
}

describe('login', () => {
  it('issues tokens whose claims carry user, tenant, role and expiry', async () => {
    const response = await login(USERS.petra)
    expect(response.status).toBe(200)
    expect(response.body.expiresIn).toBe(900)
    const claims = decodeAccessToken(response.body.accessToken)
    const t = tenantBySlug('alarmko')
    expect(claims).toMatchObject({ tenant_id: t.tenant.id, role: 'technician' })
    expect(claims?.technician_id).toBeTruthy()
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBe(900)
  })

  it('rejects a wrong password with 401', async () => {
    const response = await login(USERS.petra, 'wrong')
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('auth.invalid_credentials')
  })

  it('rejects a tenant the user is not a member of', async () => {
    expect((await login(USERS.petra, PASSWORD, tenantBySlug('bura-klima').tenant.id)).status).toBe(
      401,
    )
  })

  it('/me returns user, active tenant, role and memberships', async () => {
    const me = (await (await loginAs(USERS.ana)).get<Me>('/me')).body
    expect(me.tenant.slug).toBe('alarmko')
    expect(me.role).toBe('dispatcher')
    expect(me.memberships.map((m) => m.tenant.slug).sort()).toEqual(['alarmko', 'bura-klima'])
  })
})

describe('login throttling', () => {
  it('locks after 5 failures: 429 with Retry-After, even with the right password', async () => {
    for (let i = 0; i < 5; i++) expect((await login(USERS.ivan, 'wrong')).status).toBe(401)

    const locked = await login(USERS.ivan)
    expect(locked.status).toBe(429)
    expect(Number(locked.headers.get('Retry-After'))).toBeGreaterThan(14 * 60)
    // Other accounts are unaffected
    expect((await login(USERS.luka)).status).toBe(200)
  })

  it('unlocks after 15 minutes', async () => {
    for (let i = 0; i < 5; i++) await login(USERS.ivan, 'wrong')
    advanceClock(14 * 60_000)
    expect((await login(USERS.ivan)).status).toBe(429)
    advanceClock(61_000)
    expect((await login(USERS.ivan)).status).toBe(200)
  })

  it('is cleared by resetMockDb (so the demo can never lock itself for good)', async () => {
    for (let i = 0; i < 5; i++) await login(USERS.ivan, 'wrong')
    resetMockDb()
    expect((await login(USERS.ivan)).status).toBe(200)
  })

  it('forgets failures on a successful login', async () => {
    for (let i = 0; i < 4; i++) await login(USERS.ivan, 'wrong')
    expect((await login(USERS.ivan)).status).toBe(200)
    for (let i = 0; i < 4; i++) await login(USERS.ivan, 'wrong')
    expect((await login(USERS.ivan)).status).toBe(200)
  })
})

describe('access token', () => {
  it('is required', async () => {
    const response = await api<ProblemDetails>('get', '/me')
    expect(response.status).toBe(401)
  })

  it('expires after 15 minutes', async () => {
    const session = await loginAs(USERS.alarmkoDispatcher)
    advanceClock(14 * 60_000)
    expect((await session.get('/me')).status).toBe(200)
    advanceClock(61_000)
    const expired = await session.get<ProblemDetails>('/me')
    expect(expired.status).toBe(401)
    expect(expired.body.code).toBe('auth.token_expired')
  })

  it('stops working when the membership is deactivated', async () => {
    const session = await loginAs(USERS.luka)
    const db = getDb()
    const user = db.users.find((u) => u.email === USERS.luka)
    const membership = db.memberships.find((m) => m.userId === user?.id)
    if (membership) membership.isActive = false
    const response = await session.get<ProblemDetails>('/me')
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('auth.access_revoked')
  })

  it('refuses to refresh a deactivated membership with auth.access_revoked', async () => {
    const tokens = (await login(USERS.luka)).body
    const db = getDb()
    const user = db.users.find((u) => u.email === USERS.luka)
    const membership = db.memberships.find((m) => m.userId === user?.id)
    if (membership) membership.isActive = false
    const response = await refresh(tokens.refreshToken)
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('auth.access_revoked')
  })
})

describe('refresh rotation', () => {
  it('rotates: a new pair each time, and the new access token works', async () => {
    const first = (await login(USERS.alarmkoDispatcher)).body
    const second = await refresh(first.refreshToken)
    expect(second.status).toBe(200)
    expect(second.body.refreshToken).not.toBe(first.refreshToken)
    expect((await sessionFor(second.body).get('/me')).status).toBe(200)
  })

  it('reusing a rotated token revokes the whole family (401), including the newest token', async () => {
    const first = (await login(USERS.alarmkoDispatcher)).body
    const second = (await refresh(first.refreshToken)).body

    const reuse = await refresh(first.refreshToken)
    expect(reuse.status).toBe(401)
    expect(reuse.body.code).toBe('auth.refresh_token_reused')

    const afterTheft = await refresh(second.refreshToken)
    expect(afterTheft.status).toBe(401)
    expect(afterTheft.body.code).toBe('auth.refresh_token_revoked')
  })

  it('does not touch other logins of the same user', async () => {
    const phone = (await login(USERS.alarmkoDispatcher)).body
    const laptop = (await login(USERS.alarmkoDispatcher)).body
    await refresh(phone.refreshToken)
    await refresh(phone.refreshToken) // reuse → phone family revoked
    expect((await refresh(laptop.refreshToken)).status).toBe(200)
  })

  it('rejects unknown tokens', async () => {
    expect((await refresh('rt_unknown')).status).toBe(401)
  })

  it('logout revokes the family', async () => {
    const tokens = (await login(USERS.alarmkoDispatcher)).body
    const session = sessionFor(tokens)
    expect((await session.post('/auth/logout', { refreshToken: tokens.refreshToken })).status).toBe(
      204,
    )
    expect((await refresh(tokens.refreshToken)).status).toBe(401)
  })
})

describe('switch-tenant', () => {
  it('gives a dispatcher of both tenants tokens for the other one', async () => {
    const session = await loginAs(USERS.ana)
    const bura = tenantBySlug('bura-klima')

    const switched = await session.post<TokenResponse>('/auth/switch-tenant', {
      tenantId: bura.tenant.id,
    })
    expect(switched.status).toBe(200)
    expect(switched.body.tenantId).toBe(bura.tenant.id)

    const me = (await sessionFor(switched.body).get<Me>('/me')).body
    expect(me.tenant.slug).toBe('bura-klima')
  })

  it('remembers the last-used tenant for the next login', async () => {
    const session = await loginAs(USERS.ana)
    await session.post('/auth/switch-tenant', { tenantId: tenantBySlug('bura-klima').tenant.id })
    expect((await login(USERS.ana)).body.tenantId).toBe(tenantBySlug('bura-klima').tenant.id)
  })

  it('refuses a tenant the user does not belong to (403)', async () => {
    const session = await loginAs(USERS.petra)
    const response = await session.post<ProblemDetails>('/auth/switch-tenant', {
      tenantId: tenantBySlug('bura-klima').tenant.id,
    })
    expect(response.status).toBe(403)
  })
})

describe('password forgot', () => {
  it('always answers 202 (no account enumeration)', async () => {
    expect(
      (await api('post', '/auth/password/forgot', { body: { email: 'nobody@nowhere.test' } }))
        .status,
    ).toBe(202)
    expect(
      (await api('post', '/auth/password/forgot', { body: { email: USERS.ivan } })).status,
    ).toBe(202)
  })
})
