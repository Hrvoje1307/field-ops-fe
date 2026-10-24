import { describe, expect, it } from 'vitest'

import type { CustomFieldDefinition } from '@/shared/api/generated/model'

import { ALL_TYPES, definition } from './definitions.fixture'
import { customFieldFormValues } from './form-values'
import { buildCustomFieldsSchema } from './schema'
import type { CustomFieldFormValues } from './types'

function parse(
  definitions: CustomFieldDefinition[],
  values: CustomFieldFormValues,
  options?: Parameters<typeof buildCustomFieldsSchema>[1],
) {
  const result = buildCustomFieldsSchema(definitions, options).safeParse(values)
  return result.success
    ? { data: result.data, errors: {} }
    : {
        data: undefined,
        errors: Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      }
}

const one = (overrides: Parameters<typeof definition>[0]) => [definition(overrides)]

describe('buildCustomFieldsSchema: values per type', () => {
  it('text and textarea: trimmed; empty is left out', () => {
    const defs = [
      definition({ key: 'note', type: 'text' }),
      definition({ key: 'details', type: 'textarea' }),
    ]
    expect(parse(defs, { note: '  a  ', details: 'line 1\nline 2 ' }).data).toEqual({
      note: 'a',
      details: 'line 1\nline 2',
    })
    expect(parse(defs, { note: '   ', details: '' }).data).toEqual({})
  })

  it('number: decimal comma or point; anything else is an error', () => {
    const defs = one({ key: 'size', type: 'number' })
    expect(parse(defs, { size: '6,1' }).data).toEqual({ size: 6.1 })
    expect(parse(defs, { size: '6.1' }).data).toEqual({ size: 6.1 })
    expect(parse(defs, { size: '' }).data).toEqual({})
    expect(parse(defs, { size: '6 kW' }).errors).toEqual({ size: 'Upišite broj.' })
  })

  it('date: a real yyyy-MM-dd date', () => {
    const defs = one({ key: 'due', type: 'date' })
    expect(parse(defs, { due: '2026-10-24' }).data).toEqual({ due: '2026-10-24' })
    expect(parse(defs, { due: '2026-02-30' }).errors).toEqual({ due: 'Upišite ispravan datum.' })
  })

  it('select: one of the options', () => {
    const defs = one({
      key: 'level',
      type: 'select',
      options: [{ value: 'basic', label: 'Osnovna' }],
    })
    expect(parse(defs, { level: 'basic' }).data).toEqual({ level: 'basic' })
    expect(parse(defs, { level: '' }).data).toEqual({})
  })

  it('multiselect: options without duplicates; none selected is left out', () => {
    const defs = one({
      key: 'tags',
      type: 'multiselect',
      options: [
        { value: 'a', label: 'Prva' },
        { value: 'b', label: 'Druga' },
      ],
    })
    expect(parse(defs, { tags: ['b', 'a', 'b'] }).data).toEqual({ tags: ['b', 'a'] })
    expect(parse(defs, { tags: [] }).data).toEqual({})
  })

  it('checkbox: always a boolean', () => {
    const defs = one({ key: 'confirmed', type: 'checkbox' })
    expect(parse(defs, { confirmed: true }).data).toEqual({ confirmed: true })
    expect(parse(defs, { confirmed: false }).data).toEqual({ confirmed: false })
  })
})

describe('buildCustomFieldsSchema: required', () => {
  it('reports empty required fields of every type at their key', () => {
    const defs = ALL_TYPES.filter((d) => !d.isSensitive).map((d) => ({ ...d, required: true }))
    const empty = customFieldFormValues(defs, {}, { locale: 'hr-HR' })
    expect(parse(defs, empty).errors).toEqual({
      note: 'Obavezno polje.',
      details: 'Obavezno polje.',
      size: 'Obavezno polje.',
      due: 'Obavezno polje.',
      level: 'Obavezno polje.',
      tags: 'Obavezno polje.',
      // A required checkbox counts as answered when unticked (docs/backend-questions.md #24)
    })
  })

  it('a missing key counts as empty', () => {
    expect(parse(one({ key: 'note', type: 'text', required: true }), {}).errors).toEqual({
      note: 'Obavezno polje.',
    })
  })
})

describe('buildCustomFieldsSchema: removed options', () => {
  const level = definition({
    key: 'level',
    type: 'select',
    options: [{ value: 'basic', label: 'Osnovna' }],
  })
  const tags = definition({
    key: 'tags',
    type: 'multiselect',
    options: [{ value: 'a', label: 'Prva' }],
  })

  it('select: a stored value that is no longer offered fails until changed or cleared', () => {
    expect(parse([level], { level: 'old' }).errors).toEqual({
      level: 'Vrijednost „old” više nije ponuđena. Odaberite novu.',
    })
    expect(parse([level], { level: 'basic' }).data).toEqual({ level: 'basic' })
    expect(parse([level], { level: '' }).data).toEqual({})
  })

  it('multiselect: fails while a removed value is still selected', () => {
    expect(parse([tags], { tags: ['a', 'gone'] }).errors).toEqual({
      tags: 'Vrijednost „gone” više nije ponuđena. Odaberite novu.',
    })
    expect(parse([tags], { tags: ['a'] }).data).toEqual({ tags: ['a'] })
  })

  it('defaults keep removed values instead of dropping them silently', () => {
    expect(
      customFieldFormValues(
        [level, tags],
        { level: 'old', tags: ['a', 'gone'] },
        { locale: 'hr-HR' },
      ),
    ).toEqual({ level: 'old', tags: ['a', 'gone'] })
  })
})

describe('buildCustomFieldsSchema: sensitive fields', () => {
  const secret = definition({ key: 'secret', type: 'text', isSensitive: true })
  const stored = () => customFieldFormValues([secret], { secret: '4471' }, { locale: 'hr-HR' })

  it('start masked when a value is stored', () => {
    expect(stored()).toEqual({ secret: { masked: true, hadValue: true, value: '4471' } })
  })

  it('unrevealed (masked): left out, so the server keeps the stored value', () => {
    expect(parse([secret], stored()).data).toEqual({})
  })

  it('revealed and unchanged: sent', () => {
    expect(
      parse([secret], { secret: { masked: false, hadValue: true, value: '4471' } }).data,
    ).toEqual({ secret: '4471' })
  })

  it('revealed and changed: the new value is sent', () => {
    expect(
      parse([secret], { secret: { masked: false, hadValue: true, value: '9999' } }).data,
    ).toEqual({ secret: '9999' })
  })

  it('revealed and cleared: null, so the server clears it', () => {
    expect(parse([secret], { secret: { masked: false, hadValue: true, value: ' ' } }).data).toEqual(
      {
        secret: null,
      },
    )
  })

  it('nothing stored (or hidden from this user) and left empty: left out', () => {
    const empty = customFieldFormValues([secret], {}, { locale: 'hr-HR' })
    expect(empty).toEqual({ secret: { masked: false, hadValue: false, value: '' } })
    expect(parse([secret], empty).data).toEqual({})
  })

  it('required: a masked value counts as filled; a cleared one does not', () => {
    const required = { ...secret, required: true }
    expect(parse([required], stored()).data).toEqual({})
    expect(
      parse([required], { secret: { masked: false, hadValue: true, value: '' } }).errors,
    ).toEqual({ secret: 'Obavezno polje.' })
  })

  it('required is not enforced when the API may hide sensitive values from this user', () => {
    const required = { ...secret, required: true }
    const empty = customFieldFormValues([required], {}, { locale: 'hr-HR' })
    expect(parse([required], empty, { canSeeSensitive: false }).data).toEqual({})
    expect(parse([required], empty).errors).toEqual({ secret: 'Obavezno polje.' })
  })

  it('are validated like other fields once revealed', () => {
    const size = definition({ key: 'size', type: 'number', isSensitive: true })
    expect(parse([size], { size: { masked: false, hadValue: true, value: 'x' } }).errors).toEqual({
      size: 'Upišite broj.',
    })
  })
})

describe('customFieldFormValues', () => {
  it('turns API values into input values in the tenant locale', () => {
    const values = customFieldFormValues(
      ALL_TYPES,
      {
        note: 'a',
        size: 6.1,
        due: '2026-10-24',
        level: 'full',
        tags: ['a'],
        confirmed: true,
        unknown_key: 'x',
      },
      { locale: 'hr-HR' },
    )
    expect(values).toEqual({
      note: 'a',
      details: '',
      size: '6,1',
      due: '2026-10-24',
      level: 'full',
      tags: ['a'],
      confirmed: true,
      secret: { masked: false, hadValue: false, value: '' },
    })
    expect(customFieldFormValues(ALL_TYPES, { size: 6.1 }, { locale: 'en-US' }).size).toBe('6.1')
  })

  it('round-trips through the schema unchanged', () => {
    const api = { note: 'a', size: 1234.5, due: '2026-10-24', level: 'full', tags: ['c', 'a'] }
    const form = customFieldFormValues(ALL_TYPES, api, { locale: 'hr-HR' })
    expect(parse(ALL_TYPES, form).data).toEqual({ ...api, confirmed: false })
  })
})
