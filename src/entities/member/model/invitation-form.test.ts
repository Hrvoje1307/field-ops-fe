import { describe, expect, it } from 'vitest'

import { buildInvitationSchema, emptyInvitation, toInvitationBody } from './invitation-form'

const messages = (values: object) => {
  const result = buildInvitationSchema().safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('invitation form', () => {
  it('needs an e-mail address that is one', () => {
    expect(messages({ email: ' ', role: 'technician' })).toEqual(['email: Upišite email.'])
    expect(messages({ email: 'ana', role: 'technician' })).toEqual([
      'email: Upišite ispravan email.',
    ])
    expect(messages({ email: ' ana@firma.hr ', role: 'dispatcher' })).toEqual([])
  })

  it('invites a technician unless told otherwise', () => {
    expect(emptyInvitation).toEqual({ email: '', role: 'technician' })
  })

  it('sends the address trimmed and in lower case', () => {
    expect(toInvitationBody({ email: ' Ana@Firma.HR ', role: 'dispatcher' })).toEqual({
      email: 'ana@firma.hr',
      role: 'dispatcher',
    })
  })
})
