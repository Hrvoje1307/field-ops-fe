import { describe, expect, it } from 'vitest'

import { navFor } from './nav'

const me = (
  role: 'owner' | 'dispatcher',
  over: { features?: string[]; canAccessSales?: boolean } = {},
) => ({ role, features: ['sms'], canAccessSales: false, ...over })

const targets = (user: Parameters<typeof navFor>[0]) => navFor(user).map((item) => item.to)

describe('navFor', () => {
  it('gives the owner the settings and the dispatcher the day, jobs and clients', () => {
    expect(targets(me('owner'))).toEqual(['/', '/jobs', '/clients', '/messages', '/settings'])
    expect(targets(me('dispatcher'))).toEqual(['/', '/jobs', '/clients', '/messages'])
  })

  it('Prodaja only with the plan feature and the permission', () => {
    const open = { features: ['sms', 'sales'], canAccessSales: true }
    expect(targets(me('dispatcher', open))).toEqual([
      '/',
      '/jobs',
      '/clients',
      '/sales',
      '/messages',
    ])
    expect(targets(me('owner', open))).toContain('/sales')
    // the permission without the plan, the plan without the permission
    expect(targets(me('dispatcher', { features: ['sms'], canAccessSales: true }))).not.toContain(
      '/sales',
    )
    expect(targets(me('dispatcher', { features: ['sales'], canAccessSales: false }))).not.toContain(
      '/sales',
    )
    // an API without the module leaves canAccessSales out
    expect(targets({ role: 'owner', features: ['sales'] })).not.toContain('/sales')
  })
})
