import type {
  ForgotPasswordBody,
  LoginBody,
  LogoutBody,
  RefreshTokenBody,
  SwitchTenantBody,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import {
  activeMembership,
  activeMemberships,
  checkLoginThrottle,
  clearLoginFailures,
  issueTokens,
  recordLoginFailure,
  revokeFamily,
  rotateRefreshToken,
} from '../lib/auth'
import { presentMe } from '../lib/present'
import { accepted, forbidden, noContent, ok, unauthorized } from '../lib/problems'
import { publicRoute, route } from '../lib/route'

export const authHandlers = [
  publicRoute<LoginBody>('post', '/auth/login', ({ db, body }) => {
    const email = body.email.trim().toLowerCase()
    checkLoginThrottle(db, email)

    const user = db.users.find((u) => u.email.toLowerCase() === email)
    if (user?.password !== body.password) {
      recordLoginFailure(db, email)
      throw unauthorized('auth.invalid_credentials', 'Neispravan e-mail ili lozinka.')
    }
    const memberships = activeMemberships(db, user.id)
    const tenantId = body.tenantId
      ? memberships.find((m) => m.tenantId === body.tenantId)?.tenantId
      : (memberships.find((m) => m.tenantId === user.lastTenantId) ?? memberships[0])?.tenantId
    // A tenant the user doesn't belong to is treated like bad credentials
    if (!tenantId) throw unauthorized('auth.not_a_member')

    clearLoginFailures(db, email)
    user.lastLoginAt = toIsoInstant(Date.now())
    return ok(issueTokens(db, user, tenantId))
  }),

  publicRoute<RefreshTokenBody>('post', '/auth/refresh', ({ db, body }) =>
    ok(rotateRefreshToken(db, body.refreshToken)),
  ),

  route<LogoutBody>('post', '/auth/logout', ({ db, auth, body }) => {
    const token = db.refreshTokens.find((r) => r.token === body.refreshToken)
    if (token?.userId === auth.user.id) revokeFamily(db, token.familyId)
    return noContent()
  }),

  route<SwitchTenantBody>('post', '/auth/switch-tenant', ({ db, auth, body }) => {
    if (!activeMembership(db, auth.user.id, body.tenantId)) throw forbidden('auth.not_a_member')
    return ok(issueTokens(db, auth.user, body.tenantId))
  }),

  // No account enumeration: always 202
  publicRoute<ForgotPasswordBody>('post', '/auth/password/forgot', () => accepted()),

  route('get', '/me', ({ db, auth }) => ok(presentMe(db, auth))),
]
