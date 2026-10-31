import { describe, expect, it } from 'vitest'

import { hasSalesAccess, hasSalesAi } from './sales-access'

const me = (over: Partial<Parameters<typeof hasSalesAccess>[0]> = {}) => ({
  role: 'dispatcher' as const,
  features: ['sms', 'sales', 'sales_ai'],
  canAccessSales: true,
  ...over,
})

describe('hasSalesAccess', () => {
  it('needs the plan feature and the permission', () => {
    expect(hasSalesAccess(me())).toBe(true)
    expect(hasSalesAccess(me({ features: ['sms'] }))).toBe(false)
    expect(hasSalesAccess(me({ canAccessSales: false }))).toBe(false)
  })

  it('a missing canAccessSales (an API without the module) means no access', () => {
    expect(hasSalesAccess(me({ canAccessSales: undefined }))).toBe(false)
    expect(hasSalesAccess({ role: 'owner', features: ['sales'] })).toBe(false)
  })

  it('owners with the permission have it; a technician never does, whatever the API says', () => {
    expect(hasSalesAccess(me({ role: 'owner' }))).toBe(true)
    expect(hasSalesAccess(me({ role: 'technician' }))).toBe(false)
  })

  it('no user, no access', () => {
    expect(hasSalesAccess(undefined)).toBe(false)
    expect(hasSalesAccess(null)).toBe(false)
  })
})

describe('hasSalesAi', () => {
  it('needs sales_ai on top of access; sync and the funnel never depend on it', () => {
    expect(hasSalesAi(me())).toBe(true)
    expect(hasSalesAi(me({ features: ['sales'] }))).toBe(false)
    expect(hasSalesAi(me({ features: ['sales_ai'] }))).toBe(false)
    expect(hasSalesAi(me({ canAccessSales: false }))).toBe(false)
  })
})
