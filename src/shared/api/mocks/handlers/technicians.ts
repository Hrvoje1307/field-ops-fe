import type {
  GetTechnicianScheduleParams,
  ListTechniciansParams,
  TechnicianCreate,
  TechnicianUpdate,
} from '@/shared/api/generated/model'

import type { TechnicianRow, TenantData } from '../db/rows'
import { ALL_ROLES, OFFICE_ROLES, viewerOf } from '../lib/access'
import { newId } from '../lib/ids'
import { presentTechnician, presentTechnicianDay } from '../lib/present'
import { created, FieldErrors, forbidden, MESSAGES, notFound, ok } from '../lib/problems'
import { route } from '../lib/route'

function validateTechnicianInput(t: TenantData, body: TechnicianUpdate, errors: FieldErrors) {
  if (body.depotId && !t.depots.some((d) => d.id === body.depotId))
    errors.add('depotId', MESSAGES.notFound)
  body.skillIds.forEach((id, index) => {
    if (!t.skills.some((s) => s.id === id))
      errors.add(`skillIds[${String(index)}]`, MESSAGES.notFound)
  })
  if (body.workStart >= body.workEnd) errors.add('workEnd', 'Kraj mora biti nakon početka.')
}

const toRow = (id: string, userId: string, body: TechnicianUpdate): TechnicianRow => ({
  id,
  userId,
  depotId: body.depotId ?? null,
  color: body.color,
  workStart: body.workStart,
  workEnd: body.workEnd,
  workingDays: body.workingDays,
  skillIds: body.skillIds,
  isActive: body.isActive,
})

export const technicianHandlers = [
  route<undefined, ListTechniciansParams>(
    'get',
    '/technicians',
    ({ db, auth, query }) =>
      ok(
        auth.t.technicians
          .filter((t) => query.includeInactive === true || t.isActive)
          .map((t) => presentTechnician(db, auth.t, t)),
      ),
    { roles: OFFICE_ROLES },
  ),

  route<TechnicianCreate>(
    'post',
    '/technicians',
    ({ db, auth, body }) => {
      const errors = new FieldErrors()
      const membership = db.memberships.find(
        (m) => m.tenantId === auth.tenantId && m.userId === body.userId && m.isActive,
      )
      if (membership?.role !== 'technician') {
        errors.add('userId', 'Korisnik mora biti član s ulogom tehničara.')
      } else if (auth.t.technicians.some((t) => t.userId === body.userId)) {
        errors.add('userId', MESSAGES.duplicate)
      }
      validateTechnicianInput(auth.t, body, errors)
      errors.throwIfAny()
      const row = toRow(newId(), body.userId, body)
      auth.t.technicians.push(row)
      return created(presentTechnician(db, auth.t, row))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/technicians/{id}',
    ({ db, auth, params }) => {
      const row = auth.t.technicians.find((t) => t.id === params.id)
      if (!row) throw notFound()
      return ok(presentTechnician(db, auth.t, row))
    },
    { roles: OFFICE_ROLES },
  ),

  route<TechnicianUpdate>(
    'put',
    '/technicians/{id}',
    ({ db, auth, body, params }) => {
      const index = auth.t.technicians.findIndex((t) => t.id === params.id)
      const current = auth.t.technicians[index]
      if (!current) throw notFound()
      const errors = new FieldErrors()
      validateTechnicianInput(auth.t, body, errors)
      errors.throwIfAny()
      const row = toRow(current.id, current.userId, body)
      auth.t.technicians[index] = row
      return ok(presentTechnician(db, auth.t, row))
    },
    { roles: OFFICE_ROLES },
  ),

  route<undefined, GetTechnicianScheduleParams>(
    'get',
    '/technicians/{id}/schedule',
    ({ db, auth, params, query }) => {
      // Technicians may only look at their own day
      if (auth.role === 'technician' && auth.technicianId !== params.id) throw forbidden()
      const technician = auth.t.technicians.find((t) => t.id === params.id)
      if (!technician) throw notFound()
      return ok(presentTechnicianDay(db, auth.t, technician, query.date, viewerOf(auth)))
    },
    { roles: ALL_ROLES },
  ),
]
