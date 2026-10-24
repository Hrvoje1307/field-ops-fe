import { customFetch } from './fetcher'

export interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
  /**
   * Query string. Arrays are comma-joined (the contract's array params use
   * `style: form, explode: false`); `undefined` and `null` are left out.
   */
  query?: object
  /** JSON request body; sets `Content-Type: application/json`. */
  json?: unknown
  headers?: Record<string, string>
  /**
   * `Idempotency-Key` of this user action. Reuse it when the same request is tried
   * again; without it the fetcher sends a fresh one on every non-GET request.
   */
  idempotencyKey?: string
}

/** What the contract's query params hold. */
type QueryValue = string | number | boolean | null | undefined

/** `?a=1&status=new,scheduled` for `query`; empty when nothing is set. */
export function toQueryString(query: object | undefined): string {
  const params = new URLSearchParams()
  const entries = Object.entries(query ?? {}) as [string, QueryValue | readonly QueryValue[]][]
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      if (value.length > 0) params.append(key, value.map(String).join(','))
    } else {
      params.append(key, String(value))
    }
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/**
 * A request to the API by path, e.g. `apiFetch<Job>(`/jobs/${id}`, { signal })`.
 * Goes through the fetcher: base URL, bearer token, refresh on 401, Idempotency-Key
 * on writes, and `ApiError` with the ProblemDetails body for every non-2xx response.
 */
export function apiFetch<T>(
  path: string,
  { query, json, headers, idempotencyKey, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const requestHeaders: Record<string, string> = { ...headers }
  if (json !== undefined) requestHeaders['Content-Type'] = 'application/json'
  if (idempotencyKey) requestHeaders['Idempotency-Key'] = idempotencyKey
  return customFetch<T>(`${path}${toQueryString(query)}`, {
    ...init,
    headers: requestHeaders,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  })
}
