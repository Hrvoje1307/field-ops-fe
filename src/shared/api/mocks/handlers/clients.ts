import type {
  ClientCreate,
  ClientUpdate,
  ListClientsParams,
  LookupClientByPhoneParams,
} from '@/shared/api/generated/model'
import { normalizePhone } from '@/shared/lib/phone'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { ClientRow, TenantData } from '../db/rows'
import { getRow, isOpenStatus, OFFICE_ROLES, viewerOf } from '../lib/access'
import { buildClient, insertClient } from '../lib/create-records'
import { validateCustomFields } from '../lib/custom-fields'
import { applyContacts, tenantCountry } from '../lib/inputs'
import { presentClient, presentClientSummary } from '../lib/present'
import {
  conflict,
  created,
  FieldErrors,
  invalidField,
  MESSAGES,
  noContent,
  ok,
} from '../lib/problems'
import { route } from '../lib/route'
import { matchesQuery, phoneSearchText } from '../lib/text'

function searchableText(t: TenantData, client: ClientRow): (string | null | undefined)[] {
  const country = tenantCountry(t)
  const contacts = t.contacts.filter((c) => c.clientId === client.id && !c.deletedAt)
  const locations = t.locations.filter((l) => l.clientId === client.id && !l.deletedAt)
  return [
    client.name,
    client.oib,
    client.email,
    ...contacts.flatMap((c) => [c.name, c.email, ...phoneSearchText(c.phone ?? null, country)]),
    ...locations.flatMap((l) => [l.street, l.city, l.label]),
  ]
}

const SORTS: Record<string, (a: ClientRow, b: ClientRow) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'hr'),
  createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt),
}

export const clientHandlers = [
  route<undefined, ListClientsParams>(
    'get',
    '/clients',
    ({ auth, query }) => {
      const t = auth.t
      const sort = query.sort ?? 'name'
      const compare = SORTS[sort.replace(/^-/, '')] ?? SORTS.name
      const direction = sort.startsWith('-') ? -1 : 1
      const rows = t.clients
        .filter((c) => !c.deletedAt)
        .filter((c) => !query.type || c.type === query.type)
        .filter((c) => matchesQuery(query.q, searchableText(t, c)))
        .sort((a, b) => direction * (compare?.(a, b) ?? 0))
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 50
      return ok({
        page,
        pageSize,
        totalCount: rows.length,
        items: rows
          .slice((page - 1) * pageSize, page * pageSize)
          .map((c) => presentClientSummary(t, c)),
      })
    },
    { roles: OFFICE_ROLES },
  ),

  // Registered before /clients/{id} so "lookup" isn't read as an id
  route<undefined, LookupClientByPhoneParams>(
    'get',
    '/clients/lookup',
    ({ auth, query }) => {
      const t = auth.t
      const normalizedPhone = normalizePhone(query.phone, tenantCountry(t))
      if (!normalizedPhone) invalidField('phone', MESSAGES.invalidPhone)
      const clientIds = new Set(
        t.contacts
          .filter((c) => !c.deletedAt && c.phone === normalizedPhone)
          .map((c) => c.clientId),
      )
      const matches = t.clients
        .filter((c) => !c.deletedAt && clientIds.has(c.id))
        .map((c) => presentClient(t, c, viewerOf(auth)))
      return ok({ normalizedPhone, matches })
    },
    { roles: OFFICE_ROLES },
  ),

  route<ClientCreate>(
    'post',
    '/clients',
    ({ auth, body }) => {
      const t = auth.t
      const errors = new FieldErrors()
      const built = buildClient(t, body, errors, toIsoInstant(Date.now()))
      errors.throwIfAny()
      insertClient(t, built)
      return created(presentClient(t, built.client, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/clients/{id}',
    ({ auth, params }) =>
      ok(presentClient(auth.t, getRow(auth.t.clients, params.id), viewerOf(auth))),
    { roles: OFFICE_ROLES },
  ),

  route<ClientUpdate>(
    'put',
    '/clients/{id}',
    ({ auth, body, params }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const client = getRow(t.clients, params.id)
      if (body.version !== undefined && body.version !== client.version) {
        throw conflict('client.version_conflict', 'The client was changed by someone else.')
      }
      const errors = new FieldErrors()
      const customFields = validateCustomFields(t, 'client', body.customFields, errors, {
        path: 'customFields',
        previous: client.customFields,
      })
      const { upserts, removedIds } = applyContacts(t, client.id, body.contacts, errors)
      errors.throwIfAny()

      const now = toIsoInstant(Date.now())
      for (const contact of t.contacts) {
        if (removedIds.includes(contact.id)) contact.deletedAt = now
      }
      t.contacts = [...t.contacts.filter((c) => !upserts.some((u) => u.id === c.id)), ...upserts]
      Object.assign(client, {
        type: body.type,
        name: body.name.trim(),
        oib: body.oib ?? null,
        email: body.email ?? null,
        notes: body.notes ?? null,
        customFields,
        version: client.version + 1,
        updatedAt: now,
      })
      return ok(presentClient(t, client, viewer))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/clients/{id}',
    ({ auth, params }) => {
      const client = getRow(auth.t.clients, params.id)
      if (
        auth.t.jobs.some((j) => j.clientId === client.id && !j.deletedAt && isOpenStatus(j.status))
      ) {
        throw conflict('client.has_open_jobs', 'The client has open jobs.')
      }
      client.deletedAt = toIsoInstant(Date.now())
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),
]
