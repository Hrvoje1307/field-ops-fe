import { describe, expect, it } from 'vitest'

import { settingsSectionsFor } from './sections'

const paths = (user: Parameters<typeof settingsSectionsFor>[0]) =>
  settingsSectionsFor(user).map((section) => section.to)

describe('settingsSectionsFor', () => {
  it('without the module the settings are what they were', () => {
    const list = paths({ role: 'owner', features: ['sms'], canAccessSales: false })
    expect(list).toHaveLength(9)
    expect(list.some((path) => path.startsWith('/settings/sales'))).toBe(false)
  })

  it('the owner of a plan with Sales gets the six sales sections after the others', () => {
    const list = paths({ role: 'owner', features: ['sales'], canAccessSales: true })
    expect(list.slice(-6)).toEqual([
      '/settings/sales/mailboxes',
      '/settings/sales/stages',
      '/settings/sales/follow-up-rules',
      '/settings/sales/ai',
      '/settings/sales/digest',
      '/settings/sales/exclusions',
    ])
    expect(list).toHaveLength(15)
  })

  it('an owner whose plan lacks the module, or an API without the flag, does not get them', () => {
    expect(paths({ role: 'owner', features: ['sms'], canAccessSales: true })).toHaveLength(9)
    expect(paths({ role: 'owner', features: ['sales'] } as never)).toHaveLength(9)
  })
})
