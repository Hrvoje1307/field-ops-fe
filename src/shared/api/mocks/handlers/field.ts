import type { GetMyJobsParams } from '@/shared/api/generated/model'

import { ALL_ROLES, viewerOf } from '../lib/access'
import { presentTechnicianDay } from '../lib/present'
import { forbidden, ok } from '../lib/problems'
import { route } from '../lib/route'

export const fieldHandlers = [
  route<undefined, GetMyJobsParams>(
    'get',
    '/me/jobs',
    ({ db, auth, query }) => {
      const technician = auth.t.technicians.find((t) => t.id === auth.technicianId)
      if (!technician) throw forbidden('auth.not_a_technician', 'Only technicians have a day plan.')
      return ok(presentTechnicianDay(db, auth.t, technician, query.date, viewerOf(auth)))
    },
    { roles: ALL_ROLES },
  ),
]
