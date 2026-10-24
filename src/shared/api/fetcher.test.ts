import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, parseRetryAfter } from './api-error'
import { customFetch, REFRESH_LOCK_NAME, REFRESH_TIMEOUT_MS } from './fetcher'
import type { TokenResponse } from './generated/model'
import { configureSessionStore, type SessionTokenStore } from './session-port'

const API = 'http://localhost/api/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// --- helpers -----------------------------------------------------------------

interface RecordedCall {
  url: string
  method: string
  headers: Headers
  body: unknown
}

const fetchMock = vi.fn<typeof fetch>()
const calls: RecordedCall[] = []

function json(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } })
}

function problem(status: number, extra: Record<string, unknown> = {}): Response {
  return json({ status, title: 'Problem', ...extra }, status, 'application/problem+json')
}

function tokens(n: number): TokenResponse {
  return {
    accessToken: `access-${String(n)}`,
    refreshToken: `refresh-${String(n)}`,
    expiresIn: 900,
    tenantId: '0190a1b2-0000-7000-8000-000000000001',
    role: 'dispatcher',
  }
}

/** Routes mocked requests: `handler` gets the recorded call and returns a Response (or throws). */
function respondWith(handler: (call: RecordedCall) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const call: RecordedCall = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body,
    }
    calls.push(call)
    return handler(call)
  })
}

const refreshCalls = () => calls.filter((c) => c.url === `${API}/auth/refresh`)
const bearer = (call: RecordedCall | undefined) => call?.headers.get('Authorization') ?? null

/** In-memory stand-in for entities/session (shared can't import it). */
function createFakeStore(initial: { accessToken?: string | null; refreshToken?: string | null }) {
  const state = {
    accessToken: initial.accessToken ?? null,
    refreshToken: initial.refreshToken ?? null,
  }
  const store = {
    state,
    getAccessToken: () => state.accessToken,
    getRefreshToken: () => state.refreshToken,
    reloadRefreshToken: () => state.refreshToken,
    setTokens: vi.fn((t: TokenResponse) => {
      state.accessToken = t.accessToken
      state.refreshToken = t.refreshToken
    }),
    clear: vi.fn(() => {
      state.accessToken = null
      state.refreshToken = null
    }),
  } satisfies SessionTokenStore & { state: unknown }
  configureSessionStore(store)
  return store
}

/** Accepts only `access-<n>` tokens listed in `valid`. */
function apiWithValidTokens(
  valid: string[],
  refreshResponse: () => Response = () => json(tokens(1)),
) {
  respondWith((call) => {
    if (call.url === `${API}/auth/refresh`) return refreshResponse()
    const token = bearer(call)?.replace('Bearer ', '')
    return token && valid.includes(token) ? json({ ok: true }) : problem(401)
  })
}

beforeEach(() => {
  calls.length = 0
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'locks')
})

// --- base URL & bearer -------------------------------------------------------

describe('base URL', () => {
  it('prefixes VITE_API_URL and keeps the query string', async () => {
    createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-0'])

    await customFetch('/jobs?page=2&sort=-scheduledDate')

    expect(calls[0]?.url).toBe(`${API}/jobs?page=2&sort=-scheduledDate`)
  })
})

describe('bearer token', () => {
  it('is sent on protected endpoints', async () => {
    createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-0'])

    await customFetch('/jobs')

    expect(bearer(calls[0])).toBe('Bearer access-0')
  })

  it.each([
    '/auth/login',
    '/auth/refresh',
    '/auth/password/forgot',
    '/auth/password/reset',
    '/auth/invite/accept',
    '/public/jobs/0123456789abcdef0123456789abcdef',
    '/public/jobs/0123456789abcdef0123456789abcdef/confirm?source=sms',
  ])('is not sent to %s, and no refresh happens', async (url) => {
    // Refresh token without access token would normally trigger a refresh first
    createFakeStore({ accessToken: null, refreshToken: 'refresh-0' })
    respondWith(() => json({ ok: true }))

    await customFetch(url, { method: 'POST' })

    expect(calls).toHaveLength(1)
    expect(bearer(calls[0])).toBeNull()
  })

  it.each(['/auth/logout', '/auth/switch-tenant', '/publications', '/jobs?next=/public/x'])(
    'is still sent to look-alike path %s',
    async (url) => {
      createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
      apiWithValidTokens(['access-0'])

      await customFetch(url, { method: 'POST' })

      expect(bearer(calls[0])).toBe('Bearer access-0')
    },
  )
})

// --- refresh -----------------------------------------------------------------

describe('refresh', () => {
  it('refreshes before the request when only a refresh token survived a reload', async () => {
    const store = createFakeStore({ accessToken: null, refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-1'])

    await customFetch('/jobs')

    expect(calls.map((c) => c.url)).toEqual([`${API}/auth/refresh`, `${API}/jobs`])
    expect(calls[0]?.body).toEqual({ refreshToken: 'refresh-0' })
    expect(bearer(calls[0])).toBeNull()
    expect(bearer(calls[1])).toBe('Bearer access-1')
    expect(store.setTokens).toHaveBeenCalledWith(tokens(1))
  })

  it('on 401 refreshes once and retries with the same Idempotency-Key', async () => {
    createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-1'])

    await customFetch('/jobs/1/transition', { method: 'POST', body: '{"to":"en_route"}' })

    const jobCalls = calls.filter((c) => c.url.endsWith('/transition'))
    expect(jobCalls.map(bearer)).toEqual(['Bearer access-expired', 'Bearer access-1'])
    expect(refreshCalls()).toHaveLength(1)
    const [first, retry] = jobCalls
    expect(first?.headers.get('Idempotency-Key')).toMatch(UUID)
    expect(retry?.headers.get('Idempotency-Key')).toBe(first?.headers.get('Idempotency-Key'))
    expect(retry?.body).toEqual({ to: 'en_route' })
  })

  it('shares a single refresh between parallel requests (in-tab fallback, no Web Locks)', async () => {
    expect('locks' in navigator).toBe(false)
    createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-1'])

    const results = await Promise.all([
      customFetch('/jobs'),
      customFetch('/clients'),
      customFetch('/technicians'),
    ])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshCalls()).toHaveLength(1)
  })

  it('runs the refresh inside the cross-tab Web Lock when available', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task())
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens(['access-1'])

    await Promise.all([customFetch('/jobs'), customFetch('/clients')])

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(REFRESH_LOCK_NAME, expect.any(Function))
    expect(refreshCalls()).toHaveLength(1)
  })

  it('retries with the current token, without refreshing, if another request already rotated it', async () => {
    const store = createFakeStore({ accessToken: 'access-old', refreshToken: 'refresh-0' })
    respondWith((call) => {
      if (bearer(call) === 'Bearer access-old') {
        // A parallel request refreshed while this one was on the wire
        store.state.accessToken = 'access-new'
        return problem(401)
      }
      return json({ ok: true })
    })

    await customFetch('/jobs')

    expect(calls.map(bearer)).toEqual(['Bearer access-old', 'Bearer access-new'])
    expect(refreshCalls()).toHaveLength(0)
  })

  it('throws on a second 401 instead of refreshing again', async () => {
    createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens([]) // even the fresh token is rejected

    const error = await customFetch('/jobs').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
    expect(refreshCalls()).toHaveLength(1)
  })

  it('does not refresh on a 401 from a public endpoint (wrong password)', async () => {
    const store = createFakeStore({ accessToken: null, refreshToken: 'refresh-0' })
    respondWith(() => problem(401, { code: 'auth.invalid_credentials' }))

    const error = await customFetch('/auth/login', { method: 'POST' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).problem.code).toBe('auth.invalid_credentials')
    expect(refreshCalls()).toHaveLength(0)
    expect(store.clear).not.toHaveBeenCalled()
  })

  it('does not try to refresh without a refresh token', async () => {
    createFakeStore({ accessToken: null, refreshToken: null })
    respondWith(() => problem(401))

    await expect(customFetch('/jobs')).rejects.toMatchObject({ status: 401 })
    expect(refreshCalls()).toHaveLength(0)
  })

  it.each([400, 401, 403])('clears the session when /auth/refresh answers %i', async (status) => {
    const store = createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens([], () => problem(status))

    const error = await customFetch('/jobs').catch((e: unknown) => e)

    expect(store.clear).toHaveBeenCalledTimes(1)
    expect(store.state.refreshToken).toBeNull()
    expect(error).toBeInstanceOf(ApiError)
    // Normalised: for the caller the session simply ended
    expect((error as ApiError).status).toBe(401)
  })

  it('tells revoked access apart from an expired session', async () => {
    const store = createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens([], () => problem(401, { code: 'auth.access_revoked' }))
    await customFetch('/me').catch(() => undefined)
    expect(store.clear).toHaveBeenCalledWith('revoked')

    const other = createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens([], () => problem(401, { code: 'auth.refresh_token_reused' }))
    await customFetch('/me').catch(() => undefined)
    expect(other.clear).toHaveBeenCalledWith('expired')
  })

  it('keeps the session and rethrows when /auth/refresh fails with a 5xx', async () => {
    const store = createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    apiWithValidTokens([], () => problem(503))

    await expect(customFetch('/jobs')).rejects.toMatchObject({ status: 503 })
    expect(store.clear).not.toHaveBeenCalled()
    expect(store.state.refreshToken).toBe('refresh-0')
  })

  it('keeps the session and rethrows on a network error during refresh', async () => {
    const store = createFakeStore({ accessToken: null, refreshToken: 'refresh-0' })
    respondWith(() => {
      throw new TypeError('Failed to fetch')
    })

    await expect(customFetch('/jobs')).rejects.toThrow(TypeError)
    expect(store.clear).not.toHaveBeenCalled()
    expect(store.state.refreshToken).toBe('refresh-0')
  })
})

// --- refresh timeout -----------------------------------------------------------

/** Serialising fake of navigator.locks that reports whether the lock is held. */
function installSerialisingLocks() {
  const lock = { held: false }
  let tail: Promise<unknown> = Promise.resolve()
  const request = vi.fn((_name: string, task: () => Promise<unknown>) => {
    const run = tail.then(async () => {
      lock.held = true
      try {
        return await task()
      } finally {
        lock.held = false
      }
    })
    tail = run.catch(() => undefined)
    return run
  })
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  return lock
}

/** /auth/refresh hangs until `hang` is false; protected endpoints accept only access-1. */
function apiWithHangingRefresh() {
  const control = { hang: true, signals: [] as (AbortSignal | null | undefined)[] }
  fetchMock.mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    })
    if (url === `${API}/auth/refresh`) {
      control.signals.push(init?.signal)
      // Never settles, and deliberately ignores the abort signal
      return control.hang
        ? new Promise<Response>(() => undefined)
        : Promise.resolve(json(tokens(1)))
    }
    const ok = new Headers(init?.headers).get('Authorization') === 'Bearer access-1'
    return Promise.resolve(ok ? json({ ok: true }) : problem(401))
  })
  return control
}

describe('refresh timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  it('gives up after 15 s, keeps the session and releases the lock', async () => {
    const lock = installSerialisingLocks()
    const store = createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    const api = apiWithHangingRefresh()

    const hung = customFetch('/jobs').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS - 1)
    expect(lock.held).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    const error = await hung

    expect(error).toBeInstanceOf(DOMException)
    expect((error as DOMException).name).toBe('TimeoutError')
    expect(lock.held).toBe(false)
    expect(api.signals[0]?.aborted).toBe(true)
    expect(store.clear).not.toHaveBeenCalled()
    expect(store.state.refreshToken).toBe('refresh-0')

    // The lock is free again: the next refresh goes through
    api.hang = false
    await expect(customFetch('/jobs')).resolves.toEqual({ ok: true })
    expect(refreshCalls()).toHaveLength(2)
  })

  it('also frees the in-tab single flight when Web Locks is unavailable', async () => {
    createFakeStore({ accessToken: 'access-expired', refreshToken: 'refresh-0' })
    const api = apiWithHangingRefresh()

    const hung = customFetch('/jobs').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(REFRESH_TIMEOUT_MS)
    expect((await hung) as DOMException).toMatchObject({ name: 'TimeoutError' })

    api.hang = false
    await expect(customFetch('/jobs')).resolves.toEqual({ ok: true })
    expect(refreshCalls()).toHaveLength(2)
  })
})

// --- Idempotency-Key ---------------------------------------------------------

describe('Idempotency-Key', () => {
  beforeEach(() => {
    createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
    respondWith(() => json({ ok: true }))
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('is generated for %s', async (method) => {
    await customFetch('/jobs/1', { method })

    expect(calls[0]?.headers.get('Idempotency-Key')).toMatch(UUID)
  })

  it('is not sent for GET', async () => {
    await customFetch('/jobs/1')

    expect(calls[0]?.headers.has('Idempotency-Key')).toBe(false)
  })

  it('keeps a key passed by the caller', async () => {
    await customFetch('/jobs/1/complete', {
      method: 'POST',
      headers: { 'idempotency-key': 'user-action-42' },
    })

    expect(calls[0]?.headers.get('Idempotency-Key')).toBe('user-action-42')
  })

  it('is a new key for each call', async () => {
    await customFetch('/jobs/1/materials', { method: 'POST' })
    await customFetch('/jobs/1/materials', { method: 'POST' })

    expect(calls[0]?.headers.get('Idempotency-Key')).not.toBe(
      calls[1]?.headers.get('Idempotency-Key'),
    )
  })
})

// --- errors & parsing ----------------------------------------------------------

describe('ApiError', () => {
  beforeEach(() => {
    createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
  })

  it('carries the status and the ProblemDetails body', async () => {
    respondWith(() => problem(409, { code: 'job.version_conflict', detail: 'Changed meanwhile' }))

    const error = await customFetch('/jobs/1', { method: 'PUT' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      problem: { status: 409, code: 'job.version_conflict', detail: 'Changed meanwhile' },
    })
  })

  it('exposes validation errors through fieldErrors', async () => {
    respondWith(() =>
      problem(400, {
        errors: { name: ['Obavezno polje'], 'contacts[0].phone': ['Neispravan broj'] },
      }),
    )

    const error = (await customFetch('/clients', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error.fieldErrors).toEqual({
      name: ['Obavezno polje'],
      'contacts[0].phone': ['Neispravan broj'],
    })
  })

  it('returns empty fieldErrors when the problem has none', async () => {
    respondWith(() => problem(404))

    const error = (await customFetch('/jobs/x').catch((e: unknown) => e)) as ApiError

    expect(error.fieldErrors).toEqual({})
  })

  it('builds a problem from the status when the error body is not JSON', async () => {
    respondWith(
      () =>
        new Response('<html>Bad gateway</html>', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'text/html' },
        }),
    )

    const error = (await customFetch('/jobs').catch((e: unknown) => e)) as ApiError

    expect(error.status).toBe(502)
    expect(error.problem).toEqual({ status: 502, title: 'Bad Gateway' })
    expect(error.fieldErrors).toEqual({})
  })
})

describe('Retry-After', () => {
  beforeEach(() => {
    createFakeStore({ accessToken: null, refreshToken: null })
  })

  it('is exposed as seconds on the ApiError', async () => {
    respondWith(() => {
      const response = problem(429)
      response.headers.set('Retry-After', '600')
      return response
    })
    const error = (await customFetch('/auth/login', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError
    expect(error.status).toBe(429)
    expect(error.retryAfter).toBe(600)
  })

  it('is null when the header is missing (e.g. not exposed via CORS)', async () => {
    respondWith(() => problem(429))
    const error = (await customFetch('/auth/login', { method: 'POST' }).catch(
      (e: unknown) => e,
    )) as ApiError
    expect(error.retryAfter).toBeNull()
  })

  it('accepts delay-seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-20T10:00:00Z')
    expect(parseRetryAfter('120', now)).toBe(120)
    expect(parseRetryAfter('Tue, 20 Oct 2026 10:05:00 GMT', now)).toBe(300)
    expect(parseRetryAfter('soon', now)).toBeNull()
    expect(parseRetryAfter(null, now)).toBeNull()
  })
})

describe('response parsing', () => {
  beforeEach(() => {
    createFakeStore({ accessToken: 'access-0', refreshToken: 'refresh-0' })
  })

  it('parses JSON', async () => {
    respondWith(() => json({ id: '1', status: 'new' }))

    await expect(customFetch('/jobs/1')).resolves.toEqual({ id: '1', status: 'new' })
  })

  it('returns undefined for 204', async () => {
    respondWith(() => new Response(null, { status: 204 }))

    await expect(customFetch('/jobs/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('returns text for text/csv', async () => {
    respondWith(() => new Response('a;b\n1;2', { headers: { 'content-type': 'text/csv' } }))

    await expect(customFetch('/reports/technicians')).resolves.toBe('a;b\n1;2')
  })

  it('returns a Blob for PDFs', async () => {
    respondWith(
      () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { 'content-type': 'application/pdf' },
        }),
    )

    const result = await customFetch<Blob>('/attachments/1/file')

    expect(result).toBeInstanceOf(Blob)
    expect(result.size).toBe(4)
  })
})
