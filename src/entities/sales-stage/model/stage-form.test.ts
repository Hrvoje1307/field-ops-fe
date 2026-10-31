import { describe, expect, it } from 'vitest'

import { buildStageSchema, reorderedIds, stageFormValues, toStageBody } from './stage-form'

describe('stage form', () => {
  const ok = (patch: object) =>
    buildStageSchema().safeParse({
      ...stageFormValues(undefined, '#112233'),
      name: 'Nova',
      ...patch,
    })
  it('needs a name and a #rrggbb colour; the colour comes from the API, not from code', () => {
    expect(ok({}).success).toBe(true)
    expect(ok({ name: ' ' }).success).toBe(false)
    expect(buildStageSchema().safeParse({ ...stageFormValues(), name: 'X' }).success).toBe(false)
    expect(ok({ color: 'red' }).success).toBe(false)
  })
  it('takes whole days of at least 1 or nothing', () => {
    expect(ok({ followUpDays: '3', staleAfterDays: '' }).success).toBe(true)
    expect(ok({ followUpDays: '0' }).success).toBe(false)
    expect(ok({ staleAfterDays: '1.5' }).success).toBe(false)
  })
  it('sends days as numbers or null', () => {
    expect(
      toStageBody({ ...stageFormValues(), name: 'A', color: '#ABCDEF', followUpDays: '4' }),
    ).toMatchObject({ color: '#abcdef', followUpDays: 4, staleAfterDays: null, isActive: true })
  })
  it('moves a stage one place', () => {
    expect(reorderedIds(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(reorderedIds(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(reorderedIds(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })
})
