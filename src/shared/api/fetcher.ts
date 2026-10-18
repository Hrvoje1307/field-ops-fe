import { env } from '@/shared/config/env'

import { ApiError } from './api-error'

// STUB: the real fetcher (bearer token, refresh on 401, Idempotency-Key, ProblemDetails mapping)
// is the next step. Orval calls this for every generated request.

// Orval looks for these two declarations by their literal text, so keep them as `export type`.
export type ErrorType<TError> = ApiError<TError>
export type BodyType<TBody> = TBody

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

export async function customFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  // Content-Type is left to Orval: set for JSON bodies, omitted for FormData (multipart boundary).
  const response = await fetch(`${env.apiUrl}${url}`, init)
  const body = await parseBody(response)
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}
