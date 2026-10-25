import { type QueryClient, useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { Tenant } from '@/shared/api/generated/model'

import { TENANT_STALE_TIME } from './const'

export const tenantKeys = {
  current: ['tenant'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** The active tenant: name, time zone, locale, currency, settings. */
export async function getTenant(signal?: AbortSignal) {
  return apiFetch<Tenant>('/tenant', { signal })
}

/** `/tenant` through the cache (route guards): reused while fresh, refetched when stale. */
export function fetchTenant(queryClient: QueryClient): Promise<Tenant> {
  return queryClient.query({
    queryKey: tenantKeys.current,
    queryFn: ({ signal }) => getTenant(signal),
    staleTime: TENANT_STALE_TIME,
  })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The active tenant with its settings (`requireSignature`, job number prefix…). */
export function useGetTenant() {
  return useQuery({
    queryKey: tenantKeys.current,
    queryFn: ({ signal }) => getTenant(signal),
    staleTime: TENANT_STALE_TIME,
  })
}
