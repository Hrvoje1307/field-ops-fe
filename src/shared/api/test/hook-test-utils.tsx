import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { apiFetch } from '@/shared/api/api-fetch'
import type { TokenResponse } from '@/shared/api/generated/model'
import { configureSessionStore } from '@/shared/api/session-port'

/**
 * Signs in to the mock API as `email` for a test that has no session store of its own
 * (entities can't import each other, so entity tests use this instead of entities/auth).
 */
export async function signInForTest(email: string): Promise<void> {
  let accessToken: string | null = null
  configureSessionStore({
    getAccessToken: () => accessToken,
    getRefreshToken: () => null,
    reloadRefreshToken: () => null,
    setTokens: (tokens: TokenResponse) => {
      accessToken = tokens.accessToken
    },
    clear: () => {
      accessToken = null
    },
  })
  const tokens = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    json: { email, password: 'demo' },
  })
  accessToken = tokens.accessToken
}

/** A fresh query client (no retries) and the provider wrapper `renderHook` needs. */
export function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

/** Whether the cached query at `key` is marked stale (invalidated). */
export function isInvalidated(queryClient: QueryClient, key: readonly unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated ?? false
}
