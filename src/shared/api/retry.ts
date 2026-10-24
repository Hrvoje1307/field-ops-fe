import { isClientError } from './api-error'

const MAX_RETRIES = 3

/**
 * TanStack Query retry policy: 4xx responses are final (validation, auth, conflict…),
 * so only network errors and 5xx are retried.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isClientError(error)) return false
  return failureCount < MAX_RETRIES
}
