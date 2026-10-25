import { type QueryClient, useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { Tenant, TenantUpdate, Usage } from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, JOB_DATA_ROOTS } from '@/shared/api/query-roots'

import { TENANT_STALE_TIME, TENANT_USAGE_STALE_TIME } from './const'

export const tenantKeys = {
  current: ['tenant'] as const,
  usage: (month: string) => ['tenant', 'usage', month] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** The active tenant: name, time zone, locale, currency, settings. */
export async function getTenant(signal?: AbortSignal) {
  return apiFetch<Tenant>('/tenant', { signal })
}

/** Messages and optimizations used in a month (`yyyy-MM`). */
export async function getTenantUsage(month: string, signal?: AbortSignal) {
  return apiFetch<Usage>('/tenant/usage', { query: { month }, signal })
}

// --- Writes -------------------------------------------------------------------

/** Owner only. The contract has no `version` here: the last save wins. */
export async function updateTenant(body: TenantUpdate, idempotencyKey?: string) {
  return apiFetch<Tenant>('/tenant', { method: 'PUT', json: body, idempotencyKey })
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

/** What the company used this month: SMS, e-mail and route optimizations. */
export function useGetTenantUsage(month: string) {
  return useQuery({
    queryKey: tenantKeys.usage(month),
    queryFn: ({ signal }) => getTenantUsage(month, signal),
    staleTime: TENANT_USAGE_STALE_TIME,
  })
}

/**
 * Saves the company and its settings. The saved tenant goes into the cache; the session
 * (the shell shows the name) and everything shown in the tenant's time zone or with its
 * numbering refresh.
 */
export function useUpdateTenant() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: TenantUpdate) => updateTenant(body, idempotency.keyFor(body)),
    onSuccess: (saved, body, _result, { client }) => {
      idempotency.forget(body)
      client.setQueryData(tenantKeys.current, saved)
      void invalidateRoots(client, [...JOB_DATA_ROOTS, 'auth'])
    },
  })
}
