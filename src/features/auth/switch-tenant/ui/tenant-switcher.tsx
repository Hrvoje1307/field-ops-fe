import { useTranslation } from 'react-i18next'

import type { MeMembershipsItem } from '@/shared/api/generated/model'
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'

import { useSwitchTenant } from '../model/use-switch-tenant'

interface TenantSwitcherProps {
  memberships: MeMembershipsItem[]
  currentTenantId: string
}

/** Tenant list for the user menu; renders nothing with a single membership. */
export function TenantSwitcher({ memberships, currentTenantId }: TenantSwitcherProps) {
  const { t } = useTranslation()
  const switchTenant = useSwitchTenant()
  if (memberships.length < 2) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t('auth.switchTenant.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentTenantId}
          onValueChange={(tenantId) => {
            if (tenantId !== currentTenantId) switchTenant.mutate({ data: { tenantId } })
          }}
        >
          {memberships.map((membership) => (
            <DropdownMenuRadioItem
              key={membership.tenant.id}
              value={membership.tenant.id}
              disabled={switchTenant.isPending}
            >
              {membership.tenant.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </>
  )
}
