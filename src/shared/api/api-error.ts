import type { ProblemDetails } from './generated/model'

export type FieldErrors = Record<string, string[]>

/**
 * Thrown by the fetcher for every non-2xx response.
 * `problem` is the RFC 9457 ProblemDetails body; non-JSON error bodies are
 * replaced by `{ status, title: statusText }`.
 */
export class ApiError<TProblem = ProblemDetails> extends Error {
  readonly status: number
  readonly problem: TProblem
  /**
   * Seconds from the `Retry-After` header (429), or null when absent. The API must
   * list it in Access-Control-Expose-Headers or the browser hides it.
   */
  readonly retryAfter: number | null

  constructor(
    status: number,
    problem: TProblem,
    { retryAfter = null }: { retryAfter?: number | null } = {},
  ) {
    super(`API request failed with status ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.retryAfter = retryAfter
  }

  /** Validation errors from `ProblemDetails.errors`: field path → messages. Empty if there are none. */
  get fieldErrors(): FieldErrors {
    const errors: unknown =
      typeof this.problem === 'object' && this.problem !== null
        ? (this.problem as { errors?: unknown }).errors
        : undefined
    if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) return {}

    const fieldErrors: FieldErrors = {}
    for (const [field, messages] of Object.entries(errors)) {
      if (Array.isArray(messages)) {
        fieldErrors[field] = messages.filter((m): m is string => typeof m === 'string')
      }
    }
    return fieldErrors
  }
}

/** `Retry-After` as seconds: either delay-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value?.trim()) return null
  if (/^\d+$/.test(value.trim())) return Number(value.trim())
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now) / 1000))
}

export function isClientError(error: unknown): error is ApiError<unknown> {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}
