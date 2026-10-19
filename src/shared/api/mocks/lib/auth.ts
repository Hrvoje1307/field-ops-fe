import type { Role, TokenResponse } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { MembershipRow, MockDb, TenantData, UserRow } from '../db/rows'
import { newId, newToken } from './ids'
import { tooManyRequests, unauthorized } from './problems'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const REFRESH_TOKEN_TTL_MS = 30 * 86_400_000
export const LOGIN_MAX_FAILURES = 5
export const LOGIN_LOCK_MS = 15 * 60_000

/** Claims as documented on the bearerAuth security scheme. */
export interface AccessClaims {
  sub: string
  tenant_id: string
  role: Role
  technician_id?: string
  iat: number
  exp: number
  jti: string
}

export interface AuthContext {
  user: UserRow
  tenantId: string
  role: Role
  technicianId: string | null
  t: TenantData
}

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromBase64Url = (text: string) => atob(text.replace(/-/g, '+').replace(/_/g, '/'))

/** JWT-shaped but unsigned: `header.payload.mock`. */
export function encodeAccessToken(claims: AccessClaims): string {
  const header = toBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  return `${header}.${toBase64Url(JSON.stringify(claims))}.mock`
}

export function decodeAccessToken(token: string): AccessClaims | null {
  const [, payload, signature] = token.split('.')
  if (!payload || signature !== 'mock') return null
  try {
    const claims = JSON.parse(fromBase64Url(payload)) as Partial<AccessClaims>
    return typeof claims.sub === 'string' &&
      typeof claims.tenant_id === 'string' &&
      typeof claims.exp === 'number'
      ? (claims as AccessClaims)
      : null
  } catch {
    return null
  }
}

export function activeMembership(
  db: MockDb,
  userId: string,
  tenantId: string,
): MembershipRow | undefined {
  return db.memberships.find((m) => m.userId === userId && m.tenantId === tenantId && m.isActive)
}

export function activeMemberships(db: MockDb, userId: string): MembershipRow[] {
  return db.memberships.filter((m) => m.userId === userId && m.isActive && db.tenants[m.tenantId])
}

const technicianIdOf = (t: TenantData, userId: string) =>
  t.technicians.find((tech) => tech.userId === userId)?.id ?? null

/** New access token + refresh token (in `familyId`, or a new family). */
export function issueTokens(
  db: MockDb,
  user: UserRow,
  tenantId: string,
  familyId = newId(),
): TokenResponse {
  const membership = activeMembership(db, user.id, tenantId)
  const t = db.tenants[tenantId]
  if (!membership || !t) throw unauthorized('auth.not_a_member')

  const nowMs = Date.now()
  const iat = Math.floor(nowMs / 1000)
  const technicianId = technicianIdOf(t, user.id)
  const claims: AccessClaims = {
    sub: user.id,
    tenant_id: tenantId,
    role: membership.role,
    ...(technicianId ? { technician_id: technicianId } : {}),
    iat,
    exp: iat + ACCESS_TOKEN_TTL_SECONDS,
    jti: newId(),
  }
  const refreshToken = newToken('rt')
  db.refreshTokens.push({
    token: refreshToken,
    familyId,
    userId: user.id,
    tenantId,
    expiresAt: toIsoInstant(nowMs + REFRESH_TOKEN_TTL_MS),
    usedAt: null,
    revokedAt: null,
  })
  user.lastTenantId = tenantId
  return {
    accessToken: encodeAccessToken(claims),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    tenantId,
    role: membership.role,
  }
}

/** Tenant, role and technician come from the token + current membership, never from the request. */
export function authenticate(request: Request, db: MockDb): AuthContext {
  const match = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')
  if (!match?.[1]) throw unauthorized('auth.missing_token')
  const claims = decodeAccessToken(match[1])
  if (!claims) throw unauthorized('auth.invalid_token')
  if (claims.exp * 1000 <= Date.now()) throw unauthorized('auth.token_expired')

  const user = db.users.find((u) => u.id === claims.sub)
  const membership = user && activeMembership(db, user.id, claims.tenant_id)
  const t = db.tenants[claims.tenant_id]
  if (!user || !membership || !t) throw unauthorized('auth.invalid_token')

  return {
    user,
    tenantId: claims.tenant_id,
    role: membership.role,
    technicianId: technicianIdOf(t, user.id),
    t,
  }
}

export function revokeFamily(db: MockDb, familyId: string): void {
  const now = toIsoInstant(Date.now())
  for (const row of db.refreshTokens) {
    if (row.familyId === familyId) row.revokedAt ??= now
  }
}

/** Rotation: each refresh token works once; presenting a used one revokes the whole family. */
export function rotateRefreshToken(db: MockDb, token: string): TokenResponse {
  const row = db.refreshTokens.find((r) => r.token === token)
  if (!row) throw unauthorized('auth.invalid_refresh_token')
  if (row.revokedAt) throw unauthorized('auth.refresh_token_revoked')
  if (row.usedAt) {
    revokeFamily(db, row.familyId)
    throw unauthorized(
      'auth.refresh_token_reused',
      'Refresh token reuse detected; all sessions of this login were revoked.',
    )
  }
  if (Date.parse(row.expiresAt) <= Date.now()) throw unauthorized('auth.refresh_token_expired')
  const user = db.users.find((u) => u.id === row.userId)
  if (!user || !activeMembership(db, user.id, row.tenantId)) throw unauthorized('auth.not_a_member')

  row.usedAt = toIsoInstant(Date.now())
  return issueTokens(db, user, row.tenantId, row.familyId)
}

// --- login throttling --------------------------------------------------------

function throttleEntry(db: MockDb, email: string) {
  return db.loginThrottle.find((e) => e.email === email)
}

/** 429 while the 15-minute lock after 5 failures is active; an expired lock is cleared. */
export function checkLoginThrottle(db: MockDb, email: string): void {
  const entry = throttleEntry(db, email)
  if (!entry?.lockedUntil) return
  const remainingMs = Date.parse(entry.lockedUntil) - Date.now()
  if (remainingMs > 0) throw tooManyRequests(Math.ceil(remainingMs / 1000))
  db.loginThrottle = db.loginThrottle.filter((e) => e !== entry)
}

export function recordLoginFailure(db: MockDb, email: string): void {
  const nowMs = Date.now()
  let entry = throttleEntry(db, email)
  if (!entry) {
    entry = { email, failures: [], lockedUntil: null }
    db.loginThrottle.push(entry)
  }
  entry.failures = [
    ...entry.failures.filter((at) => nowMs - Date.parse(at) < LOGIN_LOCK_MS),
    toIsoInstant(nowMs),
  ]
  if (entry.failures.length >= LOGIN_MAX_FAILURES)
    entry.lockedUntil = toIsoInstant(nowMs + LOGIN_LOCK_MS)
}

export function clearLoginFailures(db: MockDb, email: string): void {
  db.loginThrottle = db.loginThrottle.filter((e) => e.email !== email)
}
