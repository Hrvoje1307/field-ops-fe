import { describe, expect, it } from 'vitest'

import {
  buildChecklistTemplateSchema,
  checklistTemplateFormValues,
  moveItem,
  toChecklistTemplateBody,
} from './checklist-template-form'

const messages = (values: unknown) => {
  const result = buildChecklistTemplateSchema().safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('checklist template form', () => {
  it('needs a name and at least one item, each with a label', () => {
    expect(messages({ name: '', items: [{ label: ' ', required: false }] })).toEqual([
      'name: Upišite naziv kontrolne liste.',
      'items.0.label: Upišite što treba provjeriti.',
    ])
    expect(messages({ name: 'Obilazak', items: [] })).toEqual([
      'items: Dodajte barem jednu stavku.',
    ])
    expect(messages({ name: 'Obilazak', items: [{ label: 'Provjera', required: true }] })).toEqual(
      [],
    )
  })

  it('starts with one empty row, or with the stored items (required defaulting to false)', () => {
    expect(checklistTemplateFormValues()).toEqual({
      name: '',
      items: [{ label: '', required: false }],
    })
    expect(
      checklistTemplateFormValues({
        id: '1',
        name: 'A',
        items: [{ label: 'x' }, { label: 'y', required: true }],
      }).items,
    ).toEqual([
      { label: 'x', required: false },
      { label: 'y', required: true },
    ])
  })

  it('sends trimmed texts in the order shown', () => {
    expect(
      toChecklistTemplateBody({
        name: ' A ',
        items: [
          { label: ' b ', required: true },
          { label: 'c', required: false },
        ],
      }),
    ).toEqual({
      name: 'A',
      items: [
        { label: 'b', required: true },
        { label: 'c', required: false },
      ],
    })
  })

  it('moves an item up or down, and not past the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
})
