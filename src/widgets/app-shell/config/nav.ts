import {
  CalendarDaysIcon,
  ClipboardListIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

import { hasSalesAccess } from '@/entities/auth'
import type { Me, Role } from '@/shared/api/generated/model'

export interface NavItem {
  to: '/' | '/jobs' | '/clients' | '/sales' | '/messages' | '/settings'
  labelKey:
    | 'shell.nav.today'
    | 'shell.nav.jobs'
    | 'shell.nav.clients'
    | 'shell.nav.sales'
    | 'shell.nav.messages'
    | 'shell.nav.settings'
  icon: LucideIcon
  /** Shown only to these roles; everyone in the office when absent. */
  roles?: readonly Role[]
  /** The item needs the Sales module: the plan has it and the user may use it. */
  requiresSales?: boolean
}

/** Office navigation (owner, dispatcher). */
export const OFFICE_NAV: readonly NavItem[] = [
  { to: '/', labelKey: 'shell.nav.today', icon: CalendarDaysIcon },
  { to: '/jobs', labelKey: 'shell.nav.jobs', icon: ClipboardListIcon },
  { to: '/clients', labelKey: 'shell.nav.clients', icon: UsersIcon },
  { to: '/sales', labelKey: 'shell.nav.sales', icon: HandshakeIcon, requiresSales: true },
  { to: '/messages', labelKey: 'shell.nav.messages', icon: MessageSquareIcon },
  { to: '/settings', labelKey: 'shell.nav.settings', icon: SettingsIcon, roles: ['owner'] },
]

/** The items this user sees (`/me`: role, plan features and the sales permission). */
export function navFor(me: Pick<Me, 'role' | 'features' | 'canAccessSales'>): readonly NavItem[] {
  return OFFICE_NAV.filter(
    (item) =>
      (!item.roles || item.roles.includes(me.role)) && (!item.requiresSales || hasSalesAccess(me)),
  )
}
