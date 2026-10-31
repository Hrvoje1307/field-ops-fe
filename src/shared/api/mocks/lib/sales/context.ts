import { saveDb } from '../../db'
import type { AuthContext } from '../auth'
import { salesContext } from './access'
import { settleDue } from './ai'

/** The guard of every Sales operation, after finishing what was due (classifications, drafts). */
export function openSales(auth: AuthContext, options?: { ownerOnly?: boolean }) {
  const context = salesContext(auth, options)
  // What finished is stored, so a reload (or another tab) does not finish it a second time
  if (settleDue(auth.tenantId, context.t)) saveDb()
  return context
}
