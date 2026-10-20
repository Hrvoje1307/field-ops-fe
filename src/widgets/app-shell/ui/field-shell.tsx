import { type ReactNode } from 'react'

import { useMe } from '@/entities/session'
import { useTenantFormat } from '@/shared/lib/tenant-format'

import { UserMenu } from './user-menu'

/** Technician layout: phone-first header with company, today's date and the user menu. */
export function FieldShell({ children }: { children: ReactNode }) {
  const me = useMe()
  const { formatDate, today } = useTenantFormat()

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b bg-background px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold" data-testid="tenant-name">
            {me.tenant.name}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <UserMenu />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
