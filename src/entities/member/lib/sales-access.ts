import type { Member } from '@/shared/api/generated/model'

/** Owners always have sales access; the others only with the permission (missing = no). */
export function memberHasSalesAccess(member: Pick<Member, 'role' | 'canAccessSales'>): boolean {
  return member.role === 'owner' || member.canAccessSales
}

/**
 * The switch on the team screen: only for dispatchers. An owner always has access; a
 * technician works in the field area and is never given Prodaja.
 */
export function canSetSalesAccess(member: Pick<Member, 'role'>): boolean {
  return member.role === 'dispatcher'
}
