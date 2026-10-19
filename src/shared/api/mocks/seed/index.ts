import type { MockDb, MembershipRow, TenantData, UserRow } from '../db/rows'
import { createSeedIdFactory } from '../lib/ids'
import { alarmkoZagreb } from './alarmko-zagreb'
import { buildTenant } from './build'
import { buraSplit } from './bura-split'
import { SEED_PASSWORD, SEED_USERS } from './users'

/** Builds the whole mock database for `today` (tenant-local `yyyy-MM-dd`). Deterministic per day. */
export function buildSeed(today: string): MockDb {
  const id = createSeedIdFactory(`fieldops-mock:${today}`, Date.parse(`${today}T00:00:00Z`))

  const usersByKey = new Map<string, UserRow>()
  for (const u of SEED_USERS) {
    usersByKey.set(u.key, {
      id: id(),
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      password: SEED_PASSWORD,
      lastTenantId: null,
      lastLoginAt: null,
    })
  }
  const users = [...usersByKey.values()]

  const tenants: Record<string, TenantData> = {}
  const memberships: MembershipRow[] = []
  for (const seed of [alarmkoZagreb, buraSplit]) {
    const built = buildTenant(seed, { today, id, usersByKey })
    tenants[built.tenantId] = built.data
    memberships.push(...built.memberships)
  }

  // Login picks the last-used tenant: start everyone in their first membership
  for (const user of users) {
    user.lastTenantId = memberships.find((m) => m.userId === user.id)?.tenantId ?? null
  }

  return {
    schemaVersion: 1,
    seedDate: today,
    users,
    memberships,
    refreshTokens: [],
    loginThrottle: [],
    idempotency: [],
    tenants,
  }
}
