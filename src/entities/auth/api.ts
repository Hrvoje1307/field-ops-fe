import type { QueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type {
  ForgotPasswordBody,
  LoginBody,
  LogoutBody,
  Me,
  SwitchTenantBody,
  TokenResponse,
} from '@/shared/api/generated/model'

import { ME_STALE_TIME } from './const'

export const authKeys = {
  me: ['auth', 'me'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** Current user, active tenant and memberships. */
export async function getMe(signal?: AbortSignal) {
  return apiFetch<Me>('/me', { signal })
}

/** `/me` through the cache (route guards): reused while fresh, refetched when stale. */
export function fetchMe(queryClient: QueryClient): Promise<Me> {
  return queryClient.query({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => getMe(signal),
    staleTime: ME_STALE_TIME,
  })
}

// --- POST (used as mutationFn) -----------------------------------------------

export async function login(body: LoginBody) {
  return apiFetch<TokenResponse>('/auth/login', { method: 'POST', json: body })
}

/** Revokes the refresh token family. */
export async function logout(body: LogoutBody) {
  return apiFetch<undefined>('/auth/logout', { method: 'POST', json: body })
}

export async function switchTenant(body: SwitchTenantBody) {
  return apiFetch<TokenResponse>('/auth/switch-tenant', { method: 'POST', json: body })
}

/** Always 202: the API never tells whether the account exists. */
export async function forgotPassword(body: ForgotPasswordBody) {
  return apiFetch<undefined>('/auth/password/forgot', { method: 'POST', json: body })
}
