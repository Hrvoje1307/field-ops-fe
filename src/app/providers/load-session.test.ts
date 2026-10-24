import { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { sessionStore } from '@/entities/session'
import { login } from '@/shared/api/generated/auth/auth'
import { resetMockDb } from '@/shared/api/mocks/db'
import { server } from '@/shared/api/mocks/node'

import { loadSignedInSession } from './load-session'
import { connectSession } from './session'

const API = 'http://localhost/api/v1'

function problem(status: number) {
  return HttpResponse.json(
    { status, title: 'Forbidden' },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

async function signInAs(email: string) {
  sessionStore.setTokens(await login({ email, password: 'demo' }))
}

/** The redirect thrown by the guard, or fails the test. */
async function redirectFrom(promise: Promise<unknown>) {
  const thrown: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  )
  if (!isRedirect(thrown)) throw new Error(`Expected a redirect, got ${String(thrown)}`)
  return thrown.options
}

beforeEach(() => {
  resetMockDb()
  sessionStore.clear()
  connectSession()
})

describe('loadSignedInSession', () => {
  it('sends a visitor without a session to /login, coming back afterwards', async () => {
    const options = await redirectFrom(loadSignedInSession(new QueryClient(), '/jobs?page=2'))
    expect(options).toMatchObject({ to: '/login', search: { redirect: '/jobs?page=2' } })
  })

  it('returns /me for a valid session', async () => {
    await signInAs('petra@alarmko.test')
    const { me } = await loadSignedInSession(new QueryClient(), '/field')
    expect(me.role).toBe('technician')
  })

  it('a 403 from /me ends the session as revoked access', async () => {
    await signInAs('petra@alarmko.test')
    server.use(http.get(`${API}/me`, () => problem(403)))

    const options = await redirectFrom(loadSignedInSession(new QueryClient(), '/field'))
    expect(options).toMatchObject({ to: '/login', search: { reason: 'access_revoked' } })
    expect(sessionStore.getSnapshot()).toMatchObject({
      isAuthenticated: false,
      endReason: 'revoked',
    })
  })

  it('a 403 from /tenant does not end the session (formatting falls back to defaults)', async () => {
    await signInAs('petra@alarmko.test')
    server.use(http.get(`${API}/tenant`, () => problem(403)))

    const { me } = await loadSignedInSession(new QueryClient(), '/field')
    expect(me.role).toBe('technician')
    expect(sessionStore.getSnapshot().isAuthenticated).toBe(true)
  })

  it('other /me failures go to the error page, the session stays', async () => {
    await signInAs('petra@alarmko.test')
    server.use(http.get(`${API}/me`, () => problem(503)))

    await expect(loadSignedInSession(new QueryClient(), '/field')).rejects.toMatchObject({
      status: 503,
    })
    expect(sessionStore.getSnapshot().isAuthenticated).toBe(true)
  })
})
