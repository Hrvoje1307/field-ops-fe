import { describe, expect, it } from 'vitest'

import { buildInvitationSchema, emptyInvitation, toInvitationBody } from './invitation-form'

const messages = (values: object) => {
  const result = buildInvitationSchema().safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('invitation form', () => {
  it('needs an e-mail address that is one', () => {
    expect(messages({ email: ' ', role: 'technician', canAccessSales: false })).toEqual([
      'email: Upišite email.',
    ])
    expect(messages({ email: 'ana', role: 'technician', canAccessSales: false })).toEqual([
      'email: Upišite ispravan email.',
    ])
    expect(
      messages({ email: ' ana@firma.hr ', role: 'dispatcher', canAccessSales: false }),
    ).toEqual([])
  })

  it('invites a technician unless told otherwise', () => {
    expect(emptyInvitation).toEqual({ email: '', role: 'technician', canAccessSales: false })
  })

  it('sends the address trimmed and in lower case', () => {
    expect(
      toInvitationBody({ email: ' Ana@Firma.HR ', role: 'dispatcher', canAccessSales: false }),
    ).toEqual({ email: 'ana@firma.hr', role: 'dispatcher' })
  })

  it('sends the sales permission only for a dispatcher who is given it', () => {
    const base = { email: 'a@b.hr', canAccessSales: true }
    expect(toInvitationBody({ ...base, role: 'dispatcher' })).toEqual({
      email: 'a@b.hr',
      role: 'dispatcher',
      canAccessSales: true,
    })
    // an owner has it anyway and a technician never does: the form may still hold a ticked box
    expect(toInvitationBody({ ...base, role: 'owner' })).not.toHaveProperty('canAccessSales')
    expect(
      toInvitationBody({ ...base, role: 'technician', canAccessSales: false }),
    ).not.toHaveProperty('canAccessSales')
  })
})
