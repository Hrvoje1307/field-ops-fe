import type { MockDb } from './rows'

export const MOCK_DB_STORAGE_KEY = 'fieldops.mockdb.v1'

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadDb(): MockDb | null {
  try {
    const raw = getStorage()?.getItem(MOCK_DB_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MockDb>
    return parsed.schemaVersion === 1 && typeof parsed.seedDate === 'string'
      ? (parsed as MockDb)
      : null
  } catch {
    return null
  }
}

export function storeDb(db: MockDb): void {
  try {
    getStorage()?.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Quota or privacy mode: the mock keeps working in memory
  }
}
