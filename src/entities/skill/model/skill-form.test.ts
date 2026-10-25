import { describe, expect, it } from 'vitest'

import { buildSkillSchema, skillFormValues, toSkillBody } from './skill-form'

const check = (name: string) => buildSkillSchema().safeParse({ name })

describe('skill form', () => {
  it('needs a name of at most 60 characters', () => {
    expect(check('  ').error?.issues[0]?.message).toBe('Upišite naziv vještine.')
    expect(check('a'.repeat(61)).error?.issues[0]?.message).toBe(
      'Naziv vještine ima najviše 60 znakova.',
    )
    expect(check('a'.repeat(60)).success).toBe(true)
  })

  it('starts empty or with the stored name, and sends the name trimmed', () => {
    expect(skillFormValues()).toEqual({ name: '' })
    expect(skillFormValues({ id: '1', name: 'Zavarivanje' })).toEqual({ name: 'Zavarivanje' })
    expect(toSkillBody({ name: '  Zavarivanje ' })).toEqual({ name: 'Zavarivanje' })
  })
})
