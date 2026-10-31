import type { AuthContext } from '../auth'
import { salesContext } from './access'
import { settleDue } from './ai'

/** The guard of every Sales operation, after finishing what was due (classifications, drafts). */
export function openSales(auth: AuthContext, options?: { ownerOnly?: boolean }) {
  const context = salesContext(auth, options)
  settleDue(auth.tenantId, context.t)
  return context
}
