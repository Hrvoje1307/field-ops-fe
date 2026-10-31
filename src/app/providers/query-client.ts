import { QueryCache, QueryClient } from '@tanstack/react-query'

import { authKeys } from '@/entities/auth'
import { ApiError } from '@/shared/api/api-error'
import { shouldRetry } from '@/shared/api/retry'

/** 403 codes of the Sales tag: the plan lacks the module, or the user's permission is gone. */
const SALES_ACCESS_CODES = ['sales.not_enabled', 'sales.forbidden']

export function isSalesAccessLost(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false
  const code = (error.problem as { code?: string } | undefined)?.code
  return code !== undefined && SALES_ACCESS_CODES.includes(code)
}

export function createAppQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // `/me` is cached for minutes, so a permission taken away since stays in the menu until
      // it is read again. The API saying so is the cue: read `/me`, and the menu and the
      // route guards follow what it now says.
      onError: (error) => {
        if (isSalesAccessLost(error)) void client.invalidateQueries({ queryKey: authKeys.me })
      },
    }),
    defaultOptions: {
      queries: {
        retry: shouldRetry,
      },
    },
  })
  return client
}

export const queryClient = createAppQueryClient()
