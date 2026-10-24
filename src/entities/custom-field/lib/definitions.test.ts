import { describe, expect, it } from 'vitest'

import { definition } from '../model/definitions.fixture'
import { customFieldPaths, prepareDefinitions, removedOptions } from './definitions'

describe('prepareDefinitions', () => {
  it('orders by sortOrder, then label', () => {
    const ordered = prepareDefinitions([
      definition({ key: 'c', type: 'text', label: 'C', sortOrder: 2 }),
      definition({ key: 'b', type: 'text', label: 'B', sortOrder: 1 }),
      definition({ key: 'a', type: 'text', label: 'A', sortOrder: 2 }),
    ])
    expect(ordered.map((d) => d.key)).toEqual(['b', 'a', 'c'])
  })

  it('keeps one field per key; one set for the asset type wins over one for every type', () => {
    const general = definition({ key: 'size', type: 'number', entity: 'asset', assetTypeId: null })
    const forType = definition({
      key: 'size',
      type: 'number',
      entity: 'asset',
      assetTypeId: 'type-1',
      required: true,
    })
    expect(prepareDefinitions([general, forType])).toEqual([forType])
    expect(prepareDefinitions([forType, general])).toEqual([forType])
  })
})

describe('customFieldPaths and removedOptions', () => {
  const level = definition({
    key: 'level',
    type: 'select',
    options: [{ value: 'basic', label: 'Osnovna' }],
  })

  it('gives the form paths of the fields, with a prefix', () => {
    expect(customFieldPaths([level])).toEqual(['customFields.level'])
    expect(customFieldPaths([level], 'firstLocation.customFields')).toEqual([
      'firstLocation.customFields.level',
    ])
  })

  it('finds stored values whose option is gone', () => {
    expect(removedOptions(level, 'basic')).toEqual([])
    expect(removedOptions(level, '')).toEqual([])
    expect(removedOptions(level, 'old')).toEqual(['old'])
    expect(removedOptions({ ...level, type: 'multiselect' }, ['basic', 'x', 'y'])).toEqual([
      'x',
      'y',
    ])
    expect(removedOptions(definition({ key: 'note', type: 'text' }), 'old')).toEqual([])
  })
})
