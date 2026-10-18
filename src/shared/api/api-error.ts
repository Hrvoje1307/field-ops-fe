/**
 * Thrown by the fetcher for every non-2xx response.
 * `body` is the parsed response, usually RFC 9457 ProblemDetails.
 */
export class ApiError<TBody = unknown> extends Error {
  readonly status: number
  readonly body: TBody

  constructor(status: number, body: TBody) {
    super(`API request failed with status ${String(status)}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export function isClientError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}
