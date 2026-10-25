import { describe, expect, it } from 'vitest'

import { assetTypeFormValues, buildAssetTypeSchema, toAssetTypeBody } from './asset-type-form'

describe('equipment type form', () => {
  it('needs a name; the icon is optional', () => {
    const schema = buildAssetTypeSchema()
    expect(schema.safeParse({ name: ' ', icon: '' }).error?.issues[0]?.message).toBe(
      'Upišite naziv vrste opreme.',
    )
    expect(schema.safeParse({ name: 'Klima', icon: '' }).success).toBe(true)
  })

  it('keeps the stored icon when the type is opened, sends null when it is emptied', () => {
    const stored = { id: '1', name: 'Klima', icon: 'snowflake' }
    expect(assetTypeFormValues(stored)).toEqual({ name: 'Klima', icon: 'snowflake' })
    expect(assetTypeFormValues({ id: '1', name: 'Klima', icon: null })).toEqual({
      name: 'Klima',
      icon: '',
    })
    expect(toAssetTypeBody({ name: ' Klima ', icon: ' snowflake ' })).toEqual({
      name: 'Klima',
      icon: 'snowflake',
    })
    expect(toAssetTypeBody({ name: 'Klima', icon: '  ' })).toEqual({ name: 'Klima', icon: null })
  })
})
