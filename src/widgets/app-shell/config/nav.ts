import { CalendarDaysIcon, ClipboardListIcon, UsersIcon, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: '/' | '/jobs' | '/clients'
  labelKey: 'shell.nav.today' | 'shell.nav.jobs' | 'shell.nav.clients'
  icon: LucideIcon
}

/** Office navigation (owner, dispatcher). */
export const OFFICE_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'shell.nav.today', icon: CalendarDaysIcon },
  { to: '/jobs', labelKey: 'shell.nav.jobs', icon: ClipboardListIcon },
  { to: '/clients', labelKey: 'shell.nav.clients', icon: UsersIcon },
]
