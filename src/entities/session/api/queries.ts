import { queryOptions, useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getGetMeQueryKey, getMe } from '@/shared/api/generated/auth/auth'
import type { Me } from '@/shared/api/generated/model'
import { getGetTenantQueryKey, getTenant } from '@/shared/api/generated/tenant/tenant'
import { countryFromLocale } from '@/shared/lib/phone'
import { DEFAULT_TENANT_FORMAT, type TenantFormatSettings } from '@/shared/lib/tenant-format'

const FIVE_MINUTES = 5 * 60_000

/** Current user, active tenant and memberships. */
export const meQueryOptions = () =>
  queryOptions({
    queryKey: getGetMeQueryKey(),
    queryFn: ({ signal }) => getMe({ signal }),
    staleTime: FIVE_MINUTES,
  })

/** The active tenant (name, timezone, locale, currency, settings). */
export const tenantQueryOptions = () =>
  queryOptions({
    queryKey: getGetTenantQueryKey(),
    queryFn: ({ signal }) => getTenant({ signal }),
    staleTime: FIVE_MINUTES,
  })

/** Inside the signed-in area `/me` is already loaded by the route guard. */
export function useMe(): Me {
  return useSuspenseQuery(meQueryOptions()).data
}

/**
 * Formatting settings of the active tenant, for `TenantFormatProvider`.
 * Falls back to the defaults while `/tenant` is unavailable (it only affects formatting).
 */
export function useTenantSettings(): TenantFormatSettings {
  const { data: tenant } = useQuery(tenantQueryOptions())
  return useMemo(
    () =>
      tenant
        ? {
            timeZone: tenant.timezone,
            locale: tenant.locale,
            currency: tenant.currency,
            country: countryFromLocale(tenant.locale),
          }
        : DEFAULT_TENANT_FORMAT,
    [tenant],
  )
}
