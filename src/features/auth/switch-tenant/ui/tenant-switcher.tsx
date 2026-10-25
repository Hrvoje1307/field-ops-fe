import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { roleHome, useSwitchTenant } from '@/entities/auth'
import type { MeMembershipsItem } from '@/shared/api/generated/model'
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'

interface TenantSwitcherProps {
  memberships: MeMembershipsItem[]
  currentTenantId: string
}

/** Tenant list for the user menu; renders nothing with a single membership. */
export function TenantSwitcher({ memberships, currentTenantId }: TenantSwitcherProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const switchTenant = useSwitchTenant()
  if (memberships.length < 2) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t('auth.switchTenant.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentTenantId}
          onValueChange={(tenantId) => {
            if (tenantId === currentTenantId) return
            // The new tokens replace the session (the hook); the app's session watcher
            // reloads /me, and we go to the role's home (the role may differ per tenant)
            switchTenant.mutate(
              { tenantId },
              {
                onSuccess: (tokens) => {
                  void navigate({ to: roleHome(tokens.role) })
                },
                onError: () => {
                  toast.error(t('auth.switchTenant.failed'))
                },
              },
            )
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
