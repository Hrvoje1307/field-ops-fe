import { todayInTimeZone } from '@/shared/lib/datetime'

import { buildSeed } from '../seed'
import type { MockDb, TenantData } from './rows'
import { loadDb, storeDb } from './storage'

/** Both seeded tenants are Croatian; the seed day is decided in their zone. */
const SEED_TIME_ZONE = 'Europe/Zagreb'

let db: MockDb | null = null

const today = () => todayInTimeZone(SEED_TIME_ZONE)

/**
 * The mock database. Restored from localStorage and reseeded when the stored
 * seed date isn't today (relative dates stay relative, login locks expire).
 */
export function getDb(): MockDb {
  if (db?.seedDate !== today()) {
    const stored = db ?? loadDb()
    db = stored?.seedDate === today() ? stored : buildSeed(today())
    storeDb(db)
  }
  return db
}

/** Persists the current state (called after every write). */
export function saveDb(): void {
  if (db) storeDb(db)
}

/**
 * Throws everything away and reseeds: data, sessions, login locks, idempotency keys.
 * Exposed in dev as `window.__fieldopsResetMock()`.
 */
export function resetMockDb(): MockDb {
  db = buildSeed(today())
  storeDb(db)
  return db
}

export function tenantData(tenantId: string): TenantData | undefined {
  return getDb().tenants[tenantId]
}

export type { MockDb, TenantData } from './rows'
