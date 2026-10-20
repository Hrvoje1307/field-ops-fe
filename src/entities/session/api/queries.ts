import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getGetMeQueryKey, getMe } from '@/shared/api/generated/auth/auth'
import type { Me } from '@/shared/api/generated/model'
import { getGetTenantQueryKey, getTenant } from '@/shared/api/generated/tenant/tenant'
import { countryFromLocale } from '@/shared/lib/phone'
import type { TenantFormatSettings } from '@/shared/lib/tenant-format'

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

/** Formatting settings of the active tenant, for `TenantFormatProvider`. */
export function useTenantSettings(): TenantFormatSettings {
  const { data: tenant } = useSuspenseQuery(tenantQueryOptions())
  return useMemo(
    () => ({
      timeZone: tenant.timezone,
      locale: tenant.locale,
      currency: tenant.currency,
      country: countryFromLocale(tenant.locale),
    }),
    [tenant.timezone, tenant.locale, tenant.currency],
  )
}
