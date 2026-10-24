import { type ReactNode } from 'react'

import { TenantFormatContext, type TenantFormatSettings } from './tenant-format'

/** Makes the tenant's formatting settings available to `useTenantFormat()` below it. */
export function TenantFormatProvider({
  settings,
  children,
}: {
  settings: TenantFormatSettings
  children: ReactNode
}) {
  return <TenantFormatContext value={settings}>{children}</TenantFormatContext>
}
