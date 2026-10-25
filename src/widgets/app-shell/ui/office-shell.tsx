import { Link } from '@tanstack/react-router'
import { MenuIcon, PlusIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/auth'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet'

import { navFor } from '../config/nav'
import { UserMenu } from './user-menu'

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const { role } = useMe()
  return (
    <nav aria-label={t('shell.nav.label')} className="flex flex-col gap-1">
      {navFor(role).map(({ to, labelKey, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact: to === '/' }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          <Icon className="size-4" />
          {t(labelKey)}
        </Link>
      ))}
    </nav>
  )
}

/** The office's most frequent action: a new job, e.g. while the client is on the phone. */
function NewJobButton({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  return (
    <Button asChild className="w-full justify-start">
      <Link to="/jobs/new" onClick={onNavigate}>
        <PlusIcon aria-hidden="true" />
        {t('shell.newJob')}
      </Link>
    </Button>
  )
}

/** Office layout: left rail on desktop, top bar with a slide-in menu on small screens. */
export function OfficeShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const me = useMe()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-3 md:flex">
        <div className="px-3 pt-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground">
            {t('common.appName')}
          </p>
          <p className="truncate font-semibold" data-testid="tenant-name">
            {me.tenant.name}
          </p>
        </div>
        <div className="space-y-4">
          <NewJobButton />
          <NavLinks />
        </div>
        <div className="mt-auto">
          <UserMenu showName align="start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label={t('shell.openMenu')}>
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-3">
              <SheetHeader className="px-3">
                <SheetTitle>{me.tenant.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-3">
                <NewJobButton
                  onNavigate={() => {
                    setMenuOpen(false)
                  }}
                />
              </div>
              <NavLinks
                onNavigate={() => {
                  setMenuOpen(false)
                }}
              />
            </SheetContent>
          </Sheet>
          <p className="min-w-0 flex-1 truncate font-semibold" data-testid="tenant-name-mobile">
            {me.tenant.name}
          </p>
          <UserMenu />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
