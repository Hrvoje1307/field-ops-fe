import { describe, expect, it } from 'vitest'

import {
  buildMaterialSchema,
  emptyMaterialForm,
  type MaterialFormValues,
  toMaterialInput,
  withPoint,
} from './material-form'

const parse = (values: Partial<MaterialFormValues>) =>
  buildMaterialSchema().safeParse({ ...emptyMaterialForm, ...values })
const messages = (values: Partial<MaterialFormValues>): Record<string, string> => {
  const result = parse(values)
  const found: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) found[String(issue.path[0])] = issue.message
  }
  return found
}

describe('material form', () => {
  it('a catalog item needs choosing', () => {
    expect(messages({})).toEqual({ catalogItemId: 'Odaberite materijal iz kataloga.' })
    expect(parse({ catalogItemId: 'abc' }).success).toBe(true)
  })

  it('free text needs a name and a unit; the price is optional', () => {
    expect(messages({ mode: 'custom' })).toEqual({
      name: 'Upišite naziv.',
      unit: 'Upišite jedinicu.',
    })
    expect(parse({ mode: 'custom', name: 'Vijci', unit: 'kom' }).success).toBe(true)
    expect(messages({ mode: 'custom', name: 'Vijci', unit: 'kom', unitPrice: '4,2x' })).toEqual({
      unitPrice: 'Upišite cijenu, npr. 4,20.',
    })
  })

  it('the quantity is a positive number with up to three decimals, a comma allowed', () => {
    for (const ok of ['1', '12,5', '0.250', ' 3 ']) {
      expect(parse({ catalogItemId: 'a', quantity: ok }).success, ok).toBe(true)
    }
    for (const bad of ['', '0', '0,000', '-1', '1,2345', 'dva', '1 2']) {
      expect(messages({ catalogItemId: 'a', quantity: bad }).quantity, bad).toBeDefined()
    }
  })

  it('turns a decimal comma into a point', () => {
    expect(withPoint(' 12,5 ')).toBe('12.5')
  })

  it('builds the input for a catalog item and for free text', () => {
    expect(
      toMaterialInput({ ...emptyMaterialForm, catalogItemId: 'abc', quantity: '2,5' }),
    ).toEqual({
      catalogItemId: 'abc',
      quantity: '2.5',
    })
    expect(
      toMaterialInput({
        mode: 'custom',
        catalogItemId: 'ignored',
        name: ' Vijci ',
        unit: 'kom',
        unitPrice: '0,10',
        quantity: '20',
      }),
    ).toEqual({ name: 'Vijci', unit: 'kom', unitPrice: '0.10', quantity: '20' })
    expect(
      toMaterialInput({
        ...emptyMaterialForm,
        mode: 'custom',
        name: 'A',
        unit: 'm',
        quantity: '1',
      }),
    ).toEqual({ name: 'A', unit: 'm', quantity: '1' })
  })
})
