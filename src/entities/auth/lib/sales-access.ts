import type { Me } from '@/shared/api/generated/model'

type SalesAccessInput = Pick<Me, 'features' | 'role' | 'canAccessSales'>

/** Plan feature flags (`/me`), `sales` and `sales_ai`. */
export const SALES_FEATURE = 'sales'
export const SALES_AI_FEATURE = 'sales_ai'

/** Whether the plan has the module at all (the team screen offers the switch only then). */
export function hasSalesPlan(me: Pick<Me, 'features'> | null | undefined): boolean {
  return (me?.features ?? []).includes(SALES_FEATURE)
}

/**
 * Whether the Prodaja module is open to this user: the plan has `sales` and
 * `me.canAccessSales` is true. `canAccessSales` is optional in the contract (an API
 * without the module leaves it out), so a missing value means no. A technician works in
 * the field area and never gets it. The one place that decides: the menu, the route
 * guards and every sales query go through it.
 */
export function hasSalesAccess(me: SalesAccessInput | null | undefined): boolean {
  if (!me || me.role === 'technician') return false
  return (me.features ?? []).includes(SALES_FEATURE) && me.canAccessSales === true
}

/** The AI parts (category, summary, next step, draft buttons) need `sales_ai` on top of access. */
export function hasSalesAi(me: SalesAccessInput | null | undefined): boolean {
  return hasSalesAccess(me) && (me?.features ?? []).includes(SALES_AI_FEATURE)
}
