import { describe, expect, it } from 'vitest'

import type { CustomFieldDefinition } from '@/shared/api/generated/model'

import {
  buildDefinitionSchema,
  definitionFormValues,
  type DefinitionFormValues,
  nextSortOrder,
  toDefinitionBody,
} from './definition-form'

const valid: DefinitionFormValues = {
  label: 'Broj zona',
  key: 'broj_zona',
  type: 'number',
  assetTypeId: '',
  options: [],
  required: false,
  isSensitive: false,
}

const messages = (change: Partial<DefinitionFormValues>) => {
  const result = buildDefinitionSchema().safeParse({ ...valid, ...change })
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('custom field definition form', () => {
  it('a plain field needs a label and a key of the contract’s shape', () => {
    expect(messages({})).toEqual([])
    expect(messages({ label: ' ', key: 'Broj zona' })).toEqual([
      'label: Upišite naziv polja.',
      'key: Ključ počinje malim slovom, a ima samo mala slova, brojke i _.',
    ])
    for (const bad of ['1zone', 'zone-1', '', 'a'.repeat(64)]) {
      expect(messages({ key: bad }), bad).not.toEqual([])
    }
    expect(messages({ key: 'a'.repeat(63) })).toEqual([])
  })

  it('a select needs options, each named, none twice', () => {
    expect(messages({ type: 'select' })).toEqual(['options: Dodajte barem jednu opciju.'])
    expect(messages({ type: 'multiselect', options: [{ value: '', label: ' ' }] })).toEqual([
      'options.0.label: Upišite naziv opcije.',
    ])
    expect(
      messages({
        type: 'select',
        options: [
          { value: 'a', label: 'Žica' },
          { value: '', label: 'žica' },
        ],
      }),
    ).toEqual(['options.1.label: Opcija s tim nazivom već postoji.'])
  })

  it('other types ignore options', () => {
    expect(messages({ type: 'text', options: [{ value: '', label: '' }] })).toEqual([
      'options.0.label: Upišite naziv opcije.',
    ])
  })

  it('sends new options with a value made from the label, never one already taken', () => {
    const body = toDefinitionBody(
      {
        ...valid,
        type: 'select',
        options: [
          { value: 'zica', label: 'Žica' },
          { value: '', label: 'Žica 2' },
          { value: '', label: 'Zica' },
          { value: '', label: '!!!' },
        ],
      },
      { entity: 'job', sortOrder: 30 },
    )
    expect(body.options).toEqual([
      { value: 'zica', label: 'Žica' },
      { value: 'zica_2', label: 'Žica 2' },
      { value: 'zica_3', label: 'Zica' },
      { value: 'opcija', label: '!!!' },
    ])
  })

  it('a renamed option keeps its stored value', () => {
    const body = toDefinitionBody(
      { ...valid, type: 'select', options: [{ value: 'bus', label: 'Sabirnica (novo)' }] },
      { entity: 'job', sortOrder: 10 },
    )
    expect(body.options).toEqual([{ value: 'bus', label: 'Sabirnica (novo)' }])
  })

  it('sends options only for select types and an asset type only for equipment', () => {
    const withOptions = { ...valid, options: [{ value: 'a', label: 'A' }], assetTypeId: 't1' }
    expect(toDefinitionBody(withOptions, { entity: 'asset', sortOrder: 10 })).toMatchObject({
      options: null,
      assetTypeId: 't1',
    })
    expect(toDefinitionBody(withOptions, { entity: 'client', sortOrder: 10 })).toMatchObject({
      assetTypeId: null,
    })
    expect(
      toDefinitionBody({ ...withOptions, assetTypeId: '' }, { entity: 'asset', sortOrder: 10 }),
    ).toMatchObject({ assetTypeId: null })
  })

  it('carries the entity, the order, the flags, and trimmed texts', () => {
    expect(
      toDefinitionBody(
        { ...valid, label: ' Broj zona ', required: true, isSensitive: true },
        { entity: 'location', sortOrder: 40 },
      ),
    ).toEqual({
      entity: 'location',
      assetTypeId: null,
      key: 'broj_zona',
      label: 'Broj zona',
      type: 'number',
      options: null,
      required: true,
      isSensitive: true,
      sortOrder: 40,
    })
  })

  it('opens a stored field with what it has, and a new one as optional text', () => {
    expect(definitionFormValues()).toMatchObject({ type: 'text', required: false, options: [] })
    const stored: CustomFieldDefinition = {
      id: '1',
      entity: 'asset',
      assetTypeId: 't1',
      key: 'k',
      label: 'L',
      type: 'select',
      options: [{ value: 'a', label: 'A' }],
      required: true,
      isSensitive: false,
      sortOrder: 10,
    }
    expect(definitionFormValues(stored)).toEqual({
      label: 'L',
      key: 'k',
      type: 'select',
      assetTypeId: 't1',
      options: [{ value: 'a', label: 'A' }],
      required: true,
      isSensitive: false,
    })
  })

  it('puts a new field after the last with room between', () => {
    expect(nextSortOrder([])).toBe(10)
    expect(nextSortOrder([{ sortOrder: 10 }, { sortOrder: 30 }, { sortOrder: 20 }])).toBe(40)
  })
})
