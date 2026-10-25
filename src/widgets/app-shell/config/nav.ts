import {
  CalendarDaysIcon,
  ClipboardListIcon,
  MessageSquareIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

import type { Role } from '@/shared/api/generated/model'

export interface NavItem {
  to: '/' | '/jobs' | '/clients' | '/messages' | '/settings'
  labelKey:
    | 'shell.nav.today'
    | 'shell.nav.jobs'
    | 'shell.nav.clients'
    | 'shell.nav.messages'
    | 'shell.nav.settings'
  icon: LucideIcon
  /** Shown only to these roles; everyone in the office when absent. */
  roles?: readonly Role[]
}

/** Office navigation (owner, dispatcher). */
export const OFFICE_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'shell.nav.today', icon: CalendarDaysIcon },
  { to: '/jobs', labelKey: 'shell.nav.jobs', icon: ClipboardListIcon },
  { to: '/clients', labelKey: 'shell.nav.clients', icon: UsersIcon },
  { to: '/messages', labelKey: 'shell.nav.messages', icon: MessageSquareIcon },
  { to: '/settings', labelKey: 'shell.nav.settings', icon: SettingsIcon, roles: ['owner'] },
]

/** The items this role sees. */
export function navFor(role: Role): readonly NavItem[] {
  return OFFICE_NAV.filter((item) => !item.roles || item.roles.includes(role))
}
