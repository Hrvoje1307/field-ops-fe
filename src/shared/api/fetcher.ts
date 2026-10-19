import { env } from '@/shared/config/env'

import { ApiError } from './api-error'
import type { ProblemDetails, TokenResponse } from './generated/model'
import { getSessionStore } from './session-port'

// Orval looks for these two declarations by their literal text, so keep them as `export type`.
export type ErrorType<TError> = ApiError<TError>
export type BodyType<TBody> = TBody

/** Endpoints that must never carry the bearer token or trigger a refresh. */
const PUBLIC_PATHS = [
  /^\/auth\/login$/,
  /^\/auth\/refresh$/,
  /^\/auth\/password\//,
  /^\/auth\/invite\//,
  /^\/public\//,
]

/** Web Locks name shared by all tabs, so only one tab rotates the refresh token at a time. */
export const REFRESH_LOCK_NAME = 'fieldops-refresh'

/** A refresh that takes longer is abandoned (session kept), so it can't hold the lock forever. */
export const REFRESH_TIMEOUT_MS = 15_000

/** /auth/refresh statuses that mean the refresh token is no good: the session is over. */
const SESSION_ENDING_STATUSES = new Set([400, 401, 403])

export function requiresAuth(url: string): boolean {
  const [path = ''] = url.split('?')
  return !PUBLIC_PATHS.some((pattern) => pattern.test(path))
}

function send(
  url: string,
  init: RequestInit,
  headers: Headers,
  accessToken: string | null,
): Promise<Response> {
  const requestHeaders = new Headers(headers)
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  return fetch(`${env.apiUrl}${url}`, { ...init, headers: requestHeaders })
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return undefined
  }
  const contentType = response.headers.get('content-type') ?? ''
  // application/json and application/problem+json
  if (contentType.includes('json')) {
    const text = await response.text()
    return text ? (JSON.parse(text) as unknown) : undefined
  }
  if (contentType.startsWith('text/')) return response.text()
  return response.blob()
}

function toProblem(response: Response, body: unknown): ProblemDetails {
  const isJsonObject =
    typeof body === 'object' && body !== null && !Array.isArray(body) && !(body instanceof Blob)
  return isJsonObject
    ? (body as ProblemDetails)
    : { status: response.status, title: response.statusText }
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const body = await parseBody(response)
  if (!response.ok) throw new ApiError(response.status, toProblem(response, body))
  return body as T
}

// ---------------------------------------------------------------------------
// Refresh: one in-flight refresh per tab, serialised across tabs with Web Locks
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<string> | null = null

function refreshSession(): Promise<string> {
  refreshInFlight ??= withRefreshLock(performRefresh).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = (navigator as Partial<Navigator>).locks
  // Without Web Locks the in-tab single flight above is the only guard
  if (!locks) return task()
  return locks.request(REFRESH_LOCK_NAME, task)
}

/**
 * Runs `task` with an abort signal and rejects with a TimeoutError after `ms`.
 * Racing (not only aborting) guarantees the caller is released even if the
 * underlying request ignores the signal.
 */
async function withTimeout<T>(ms: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException(
        `Token refresh timed out after ${String(ms)} ms`,
        'TimeoutError',
      )
      controller.abort(error)
      reject(error)
    }, ms)
  })
  try {
    return await Promise.race([task(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function performRefresh(): Promise<string> {
  const store = getSessionStore()
  // Inside the lock: another tab may have rotated the token while we waited.
  // Always refresh with what's stored now, never with the token this tab started with.
  const refreshToken = store.reloadRefreshToken()
  if (!refreshToken) {
    throw new ApiError<ProblemDetails>(401, { status: 401, title: 'Session ended' })
  }

  // Network errors and the timeout propagate from here and keep the session
  const { response, body } = await withTimeout(REFRESH_TIMEOUT_MS, async (signal) => {
    const res = await send(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }), signal },
      new Headers({ 'Content-Type': 'application/json' }),
      null,
    )
    return { response: res, body: await parseBody(res) }
  })

  if (!response.ok) {
    const problem = toProblem(response, body)
    if (SESSION_ENDING_STATUSES.has(response.status)) {
      store.clear()
      throw new ApiError(401, problem)
    }
    // 5xx and other failures: keep the session, the caller can retry
    throw new ApiError(response.status, problem)
  }

  const tokens = body as TokenResponse
  store.setTokens(tokens)
  return tokens.accessToken
}

// ---------------------------------------------------------------------------
// Orval mutator
// ---------------------------------------------------------------------------

export async function customFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  // Content-Type is left to Orval: set for JSON bodies, omitted for FormData (multipart boundary).
  const headers = new Headers(init.headers)
  // One key per call, reused on the retry after a refresh
  if (method !== 'GET' && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', crypto.randomUUID())
  }

  if (!requiresAuth(url)) return parseOrThrow<T>(await send(url, init, headers, null))

  const store = getSessionStore()
  let accessToken = store.getAccessToken()
  // After a reload only the refresh token survives
  if (!accessToken && store.getRefreshToken()) accessToken = await refreshSession()

  let response = await send(url, init, headers, accessToken)

  if (response.status === 401 && store.getRefreshToken()) {
    const currentToken = store.getAccessToken()
    // Another request already refreshed while this one was in flight: just retry
    accessToken =
      currentToken && currentToken !== accessToken ? currentToken : await refreshSession()
    response = await send(url, init, headers, accessToken)
  }

  return parseOrThrow<T>(response)
}
