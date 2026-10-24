import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { countryFromLocale } from '@/shared/lib/phone'
import { DEFAULT_TENANT_FORMAT, type TenantFormatSettings } from '@/shared/lib/tenant-format'

import { getTenant, tenantKeys } from '../api'
import { TENANT_STALE_TIME } from '../const'

/**
 * Formatting settings of the active tenant, for `TenantFormatProvider`. Session data,
 * read by the signed-in layout. Falls back to the defaults while `/tenant` is
 * unavailable (it only affects formatting).
 */
export function useTenantSettings(): TenantFormatSettings {
  const { data: tenant } = useQuery({
    queryKey: tenantKeys.current,
    queryFn: ({ signal }) => getTenant(signal),
    staleTime: TENANT_STALE_TIME,
  })
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
