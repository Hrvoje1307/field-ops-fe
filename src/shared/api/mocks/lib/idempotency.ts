import { toIsoInstant } from '@/shared/lib/datetime'

import type { MockDb } from '../db/rows'
import type { AuthContext } from './auth'
import { invalidField, type MockResult, unprocessable } from './problems'

const RETENTION_MS = 24 * 3_600_000

/**
 * Stores the response per (tenant, user, key). A replay with the same request
 * returns the stored response; the same key with a different request is a 422.
 */
export async function withIdempotency(
  db: MockDb,
  auth: AuthContext,
  key: string,
  requestSignature: string,
  execute: () => Promise<MockResult>,
): Promise<MockResult> {
  if (key.length < 8 || key.length > 128) {
    invalidField('Idempotency-Key', 'Ključ mora imati od 8 do 128 znakova.')
  }
  const nowMs = Date.now()
  db.idempotency = db.idempotency.filter((row) => nowMs - Date.parse(row.createdAt) < RETENTION_MS)

  const stored = db.idempotency.find(
    (row) => row.tenantId === auth.tenantId && row.userId === auth.user.id && row.key === key,
  )
  if (stored) {
    if (stored.requestSignature !== requestSignature) {
      throw unprocessable(
        'idempotency.key_reused',
        'This Idempotency-Key was already used for a different request.',
      )
    }
    return {
      status: stored.status,
      body: stored.body,
      headers: { ...stored.headers, 'Idempotent-Replayed': 'true' },
    }
  }

  const result = await execute()
  if (result.status < 500) {
    db.idempotency.push({
      tenantId: auth.tenantId,
      userId: auth.user.id,
      key,
      requestSignature,
      status: result.status,
      body:
        result.body === undefined
          ? undefined
          : (JSON.parse(JSON.stringify(result.body)) as unknown),
      headers: result.headers ?? {},
      createdAt: toIsoInstant(nowMs),
    })
  }
  return result
}
