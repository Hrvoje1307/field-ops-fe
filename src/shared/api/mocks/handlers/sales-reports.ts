import type { GetSalesReportParams, GetSalesTodayParams } from '@/shared/api/generated/model'
import { isPlainDate } from '@/shared/lib/datetime'
import { zonedDateTimeToInstant, addDays } from '@/shared/lib/datetime'

import { forbidden, invalidField, MESSAGES, ok } from '../lib/problems'
import { route } from '../lib/route'
import { openSales } from '../lib/sales/context'
import { buildReport } from '../lib/sales/report'
import { buildToday } from '../lib/sales/today'

export const salesReportHandlers = [
  route<undefined, GetSalesTodayParams>('get', '/sales/today', ({ db, auth, query }) => {
    openSales(auth)
    // Default: deals of the caller plus unowned shared-mailbox threads. Owners may pass
    // any user, or leave it out to see everyone's.
    if (auth.role === 'owner') {
      return ok(
        buildToday(db, auth, query.ownerUserId ? { ownerUserId: query.ownerUserId } : undefined),
      )
    }
    if (query.ownerUserId && query.ownerUserId !== auth.user.id) {
      throw forbidden('sales.forbidden', 'Only owners may look at another user.')
    }
    return ok(buildToday(db, auth, { ownerUserId: auth.user.id }))
  }),

  route<undefined, GetSalesReportParams>('get', '/sales/reports/summary', ({ db, auth, query }) => {
    openSales(auth)
    if (!isPlainDate(query.from)) invalidField('from', MESSAGES.invalidDate)
    if (!isPlainDate(query.to)) invalidField('to', MESSAGES.invalidDate)
    if (query.from > query.to) invalidField('to', MESSAGES.notAllowed)
    const tz = auth.t.tenant.timezone
    const range = {
      from: query.from,
      to: query.to,
      startMs: Date.parse(zonedDateTimeToInstant(query.from, '00:00', tz)),
      endMs: Date.parse(zonedDateTimeToInstant(addDays(query.to, 1), '00:00', tz)),
    }
    return ok(buildReport(db, auth, range, query.ownerUserId))
  }),
]
