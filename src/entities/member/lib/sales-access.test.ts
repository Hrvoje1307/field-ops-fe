import { describe, expect, it } from 'vitest'

import { canSetSalesAccess, memberHasSalesAccess } from './sales-access'

describe('memberHasSalesAccess', () => {
  it('owners always, others by the permission', () => {
    expect(memberHasSalesAccess({ role: 'owner', canAccessSales: false })).toBe(true)
    expect(memberHasSalesAccess({ role: 'dispatcher', canAccessSales: true })).toBe(true)
    expect(memberHasSalesAccess({ role: 'dispatcher', canAccessSales: false })).toBe(false)
    expect(memberHasSalesAccess({ role: 'technician', canAccessSales: false })).toBe(false)
  })
})

describe('canSetSalesAccess', () => {
  it('only a dispatcher has the switch', () => {
    expect(canSetSalesAccess({ role: 'dispatcher' })).toBe(true)
    expect(canSetSalesAccess({ role: 'owner' })).toBe(false)
    expect(canSetSalesAccess({ role: 'technician' })).toBe(false)
  })
})
