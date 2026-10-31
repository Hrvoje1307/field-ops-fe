import type { Role } from '@/shared/api/generated/model'

/** Owners always have sales access; the others only with the permission (missing = no). */
export function memberHasSalesAccess(member: { role: Role; canAccessSales?: boolean }): boolean {
  return member.role === 'owner' || member.canAccessSales === true
}

/**
 * The switch on the team screen: only for dispatchers. An owner always has access; a
 * technician works in the field area and is never given Prodaja.
 */
export function canSetSalesAccess(member: { role: Role }): boolean {
  return member.role === 'dispatcher'
}
