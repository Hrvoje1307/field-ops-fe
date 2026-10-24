import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/session'
import { SignOutMenuItem } from '@/features/auth/sign-out'
import { TenantSwitcher } from '@/features/auth/switch-tenant'
import { initials } from '@/shared/lib/initials'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

/** Name, role and tenant; tenant switcher (several memberships) and sign-out. */
export function UserMenu({
  showName = false,
  align = 'end',
}: {
  showName?: boolean
  align?: 'start' | 'end'
}) {
  const { t } = useTranslation()
  const me = useMe()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={
            showName ? 'h-auto w-full justify-start gap-2 px-2 py-2' : 'size-11 rounded-full p-0'
          }
          aria-label={t('shell.userMenu')}
        >
          <Avatar>
            <AvatarFallback>{initials(me.user.fullName)}</AvatarFallback>
          </Avatar>
          {showName && (
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate text-sm font-medium">{me.user.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {t(`roles.${me.role}`)}
              </span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="font-medium">{me.user.fullName}</span>
          <span className="text-xs font-normal text-muted-foreground">{me.user.email}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t(`roles.${me.role}`)} · {me.tenant.name}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <TenantSwitcher memberships={me.memberships} currentTenantId={me.tenant.id} />
        <SignOutMenuItem />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
