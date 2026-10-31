import { describe, expect, it } from 'vitest'

import { buildDealSchema, dealFormValues, toDealBody } from './deal-form'

describe('deal form', () => {
  const parse = (value: string) =>
    buildDealSchema().safeParse({ ...dealFormValues(), title: 'T', value })
  it('accepts amounts with a point or a comma and refuses the rest', () => {
    expect(parse('1250,50').success).toBe(true)
    expect(parse('1250.5').success).toBe(true)
    expect(parse('').success).toBe(true)
    expect(parse('12,345').success).toBe(false)
    expect(parse('abc').success).toBe(false)
  })
  it('requires a title', () => {
    expect(buildDealSchema().safeParse(dealFormValues()).success).toBe(false)
  })
  it('sends the amount as a decimal string and leaves the stage out when empty', () => {
    const body = toDealBody(
      { ...dealFormValues(), title: 'T', value: '1250,50', contactPhone: '091 111 2222' },
      { source: 'manual' },
    )
    expect(body).toMatchObject({
      title: 'T',
      value: '1250.50',
      source: 'manual',
      contactName: null,
    })
    expect(body).not.toHaveProperty('stageId')
  })
})
