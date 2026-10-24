import { useRef } from 'react'

/**
 * Idempotency keys per user action. Trying the same request again (same body, e.g.
 * after a network error) reuses its key, so the server replays the stored response
 * instead of applying the change twice. A different body gets a new key: a replay with
 * another body is a 422. Requests without a key still get a fresh one in the fetcher.
 */
export function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>())
  return {
    keyFor(request: unknown): string {
      const id = JSON.stringify(request)
      let key = keys.current.get(id)
      if (!key) {
        key = crypto.randomUUID()
        keys.current.set(id, key)
      }
      return key
    },
    /** After success: the action is done, the same body later is a new action. */
    forget(request: unknown): void {
      keys.current.delete(JSON.stringify(request))
    },
  }
}
