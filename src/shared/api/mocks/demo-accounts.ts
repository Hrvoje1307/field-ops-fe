import type { Role } from '@/shared/api/generated/model'

import { alarmkoZagreb } from './seed/alarmko-zagreb'
import { buraSplit } from './seed/bura-split'
import { SEED_PASSWORD, SEED_USERS } from './seed/users'

export interface DemoAccount {
  email: string
  fullName: string
  role: Role
}

export interface DemoAccountGroup {
  /** Tenant name, or null for users who belong to several tenants. */
  tenantName: string | null
  accounts: DemoAccount[]
}

export const DEMO_PASSWORD = SEED_PASSWORD

/** Seeded users grouped by tenant, for the demo login buttons (mock mode only). */
export function demoAccountGroups(): DemoAccountGroup[] {
  const tenants = [alarmkoZagreb, buraSplit]
  const tenantCount = (key: string) =>
    tenants.filter((t) => t.members.some((m) => m.user === key)).length
  const toAccount = (key: string, role: Role): DemoAccount[] => {
    const user = SEED_USERS.find((u) => u.key === key)
    return user ? [{ email: user.email, fullName: user.fullName, role }] : []
  }

  const groups: DemoAccountGroup[] = tenants.map((t) => ({
    tenantName: t.name,
    accounts: t.members
      .filter((m) => tenantCount(m.user) === 1)
      .flatMap((m) => toAccount(m.user, m.role)),
  }))
  const shared = tenants[0]?.members.filter((m) => tenantCount(m.user) > 1) ?? []
  if (shared.length)
    groups.push({ tenantName: null, accounts: shared.flatMap((m) => toAccount(m.user, m.role)) })
  return groups
}
