import type {
  CreateInvitationBody,
  DepotInput,
  GetTenantUsageParams,
  SkillInput,
  TenantUpdate,
  UpdateMemberBody,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import { ALL_ROLES, OFFICE_ROLES, OWNER_ONLY } from '../lib/access'
import { newId } from '../lib/ids'
import { presentMember } from '../lib/present'
import {
  conflict,
  created,
  FieldErrors,
  invalidField,
  MESSAGES,
  noContent,
  notFound,
  ok,
} from '../lib/problems'
import { route } from '../lib/route'
import { normalizeText } from '../lib/text'

const DAY_MS = 86_400_000

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1
  } catch {
    return false
  }
}

export const tenantHandlers = [
  route('get', '/tenant', ({ auth }) => ok(auth.t.tenant), { roles: ALL_ROLES }),

  route<TenantUpdate>(
    'put',
    '/tenant',
    ({ auth, body }) => {
      const errors = new FieldErrors()
      if (!isValidTimeZone(body.timezone)) errors.add('timezone', MESSAGES.notAllowed)
      if (!isValidLocale(body.locale)) errors.add('locale', MESSAGES.notAllowed)
      if (!/^[A-Z]{3}$/.test(body.currency)) errors.add('currency', MESSAGES.invalidFormat)
      errors.throwIfAny()

      const tenant = auth.t.tenant
      Object.assign(tenant, {
        name: body.name,
        address: body.address ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        iban: body.iban ?? null,
        logoAttachmentId: body.logoAttachmentId ?? null,
        locale: body.locale,
        timezone: body.timezone,
        currency: body.currency,
        settings: body.settings,
        updatedAt: toIsoInstant(Date.now()),
      })
      // Oib isn't nullable in the contract: omitted means no OIB
      if (body.oib === undefined) delete tenant.oib
      else tenant.oib = body.oib
      return ok(tenant)
    },
    { roles: OWNER_ONLY },
  ),

  route<undefined, GetTenantUsageParams>(
    'get',
    '/tenant/usage',
    ({ auth, query }) =>
      ok(
        auth.t.usage.find((u) => u.month === query.month) ?? {
          month: query.month,
          smsCount: 0,
          smsCost: '0.00',
          emailCount: 0,
          optimizationsCount: 0,
        },
      ),
    { roles: OFFICE_ROLES },
  ),

  // --- depots ---
  route('get', '/depots', ({ auth }) => ok(auth.t.depots), { roles: ALL_ROLES }),

  route<DepotInput>(
    'post',
    '/depots',
    ({ auth, body }) => {
      const depot = { id: newId(), ...body }
      auth.t.depots.push(depot)
      return created(depot)
    },
    { roles: OFFICE_ROLES },
  ),

  route<DepotInput>(
    'put',
    '/depots/{id}',
    ({ auth, body, params }) => {
      const depot = auth.t.depots.find((d) => d.id === params.id)
      if (!depot) throw notFound()
      Object.assign(depot, { lat: null, lng: null, ...body })
      return ok(depot)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/depots/{id}',
    ({ auth, params }) => {
      if (!auth.t.depots.some((d) => d.id === params.id)) throw notFound()
      if (auth.t.technicians.some((t) => t.depotId === params.id)) {
        throw conflict('depot.in_use', 'Technicians still start from this depot.')
      }
      auth.t.depots = auth.t.depots.filter((d) => d.id !== params.id)
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  // --- skills ---
  route('get', '/skills', ({ auth }) => ok(auth.t.skills), { roles: ALL_ROLES }),

  route<SkillInput>(
    'post',
    '/skills',
    ({ auth, body }) => {
      const name = body.name.trim()
      if (auth.t.skills.some((s) => normalizeText(s.name) === normalizeText(name))) {
        throw conflict('skill.duplicate_name', 'A skill with this name already exists.')
      }
      const skill = { id: newId(), name }
      auth.t.skills.push(skill)
      return created(skill)
    },
    { roles: OFFICE_ROLES },
  ),

  route<SkillInput>(
    'put',
    '/skills/{id}',
    ({ auth, body, params }) => {
      const skill = auth.t.skills.find((s) => s.id === params.id)
      if (!skill) throw notFound()
      const name = body.name.trim()
      if (
        auth.t.skills.some(
          (s) => s.id !== skill.id && normalizeText(s.name) === normalizeText(name),
        )
      ) {
        invalidField('name', MESSAGES.duplicate)
      }
      skill.name = name
      return ok(skill)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/skills/{id}',
    ({ auth, params }) => {
      if (!auth.t.skills.some((s) => s.id === params.id)) throw notFound()
      auth.t.skills = auth.t.skills.filter((s) => s.id !== params.id)
      for (const technician of auth.t.technicians) {
        technician.skillIds = technician.skillIds.filter((id) => id !== params.id)
      }
      for (const jobType of auth.t.jobTypes) {
        jobType.requiredSkillIds = jobType.requiredSkillIds.filter((id) => id !== params.id)
      }
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  // --- members & invitations ---
  route(
    'get',
    '/users',
    ({ db, auth }) =>
      ok(
        db.memberships
          .filter((m) => m.tenantId === auth.tenantId)
          .map((m) => presentMember(db, auth.t, m)),
      ),
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/users/invitations',
    ({ auth }) =>
      ok(
        auth.t.invitations
          .filter((i) => !i.revokedAt && Date.parse(i.expiresAt) > Date.now())
          .map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            expiresAt: i.expiresAt,
            createdAt: i.createdAt,
          })),
      ),
    { roles: OFFICE_ROLES },
  ),

  route<CreateInvitationBody>(
    'post',
    '/users/invitations',
    ({ db, auth, body }) => {
      const email = body.email.trim().toLowerCase()
      const isMember = db.memberships.some(
        (m) =>
          m.tenantId === auth.tenantId &&
          m.isActive &&
          db.users.find((u) => u.id === m.userId)?.email.toLowerCase() === email,
      )
      const isPending = auth.t.invitations.some(
        (i) =>
          i.email.toLowerCase() === email && !i.revokedAt && Date.parse(i.expiresAt) > Date.now(),
      )
      if (isMember || isPending) throw conflict('invitation.exists', 'Already a member or invited.')
      const nowMs = Date.now()
      const invitation = {
        id: newId(),
        email,
        role: body.role,
        createdAt: toIsoInstant(nowMs),
        expiresAt: toIsoInstant(nowMs + 7 * DAY_MS),
      }
      auth.t.invitations.push({ ...invitation, revokedAt: null })
      return created(invitation)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/users/invitations/{id}',
    ({ auth, params }) => {
      const invitation = auth.t.invitations.find((i) => i.id === params.id && !i.revokedAt)
      if (!invitation) throw notFound()
      invitation.revokedAt = toIsoInstant(Date.now())
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  route<UpdateMemberBody>(
    'put',
    '/users/{userId}',
    ({ db, auth, body, params }) => {
      const membership = db.memberships.find(
        (m) => m.tenantId === auth.tenantId && m.userId === params.userId,
      )
      if (!membership) throw notFound()
      const remainingOwners = db.memberships.filter(
        (m) =>
          m.tenantId === auth.tenantId &&
          m.isActive &&
          m.role === 'owner' &&
          (m !== membership || (body.role === 'owner' && body.isActive)),
      )
      if (remainingOwners.length === 0) {
        throw conflict('member.last_owner', 'The tenant needs at least one active owner.')
      }
      membership.role = body.role
      membership.isActive = body.isActive
      return ok(presentMember(db, auth.t, membership))
    },
    { roles: OWNER_ONLY },
  ),
]
