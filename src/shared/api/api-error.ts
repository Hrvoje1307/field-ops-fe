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

  constructor(status: number, problem: TProblem) {
    super(`API request failed with status ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
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

export function isClientError(error: unknown): error is ApiError<unknown> {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}
