import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { assetFormValues, buildAssetSchema, toAssetBody } from './asset-form'

describe('asset form', () => {
  it('empty texts become null; the custom fields are those given', () => {
    const values = { ...assetFormValues(undefined, { zones: 8 }, 'at1'), model: 'X-1' }
    expect(toAssetBody(values)).toEqual({
      assetTypeId: 'at1',
      manufacturer: null,
      model: 'X-1',
      serialNo: null,
      installedAt: null,
      warrantyUntil: null,
      notes: null,
      customFields: { zones: 8 },
    })
  })

  it('needs a type; dates must be real', () => {
    const schema = buildAssetSchema(z.record(z.string(), z.unknown()))
    const result = schema.safeParse({
      ...assetFormValues(undefined, {}),
      installedAt: '2026-02-30',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['assetTypeId', 'Odaberite vrstu opreme.'],
      ['installedAt', 'Upišite ispravan datum.'],
    ])
  })
})
