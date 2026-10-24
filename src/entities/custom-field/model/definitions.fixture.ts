import type { CustomFieldDefinition } from '@/shared/api/generated/model'

type Overrides = Partial<CustomFieldDefinition> & Pick<CustomFieldDefinition, 'key' | 'type'>

/** A definition for tests; neutral labels, nothing tenant-specific. */
export function definition(overrides: Overrides): CustomFieldDefinition {
  return {
    id: `def-${overrides.key}`,
    entity: 'job',
    assetTypeId: null,
    label: overrides.key,
    options: null,
    required: false,
    isSensitive: false,
    sortOrder: 1,
    ...overrides,
  }
}

/** One field of every type, in display order. */
export const ALL_TYPES: CustomFieldDefinition[] = [
  definition({ key: 'note', type: 'text', label: 'Napomena', sortOrder: 1 }),
  definition({ key: 'details', type: 'textarea', label: 'Opis', sortOrder: 2 }),
  definition({ key: 'size', type: 'number', label: 'Veličina', required: true, sortOrder: 3 }),
  definition({ key: 'due', type: 'date', label: 'Rok', sortOrder: 4 }),
  definition({
    key: 'level',
    type: 'select',
    label: 'Razina',
    required: true,
    sortOrder: 5,
    options: [
      { value: 'basic', label: 'Osnovna' },
      { value: 'full', label: 'Puna' },
    ],
  }),
  definition({
    key: 'tags',
    type: 'multiselect',
    label: 'Oznake',
    sortOrder: 6,
    options: [
      { value: 'a', label: 'Prva' },
      { value: 'b', label: 'Druga' },
      { value: 'c', label: 'Treća' },
    ],
  }),
  definition({ key: 'confirmed', type: 'checkbox', label: 'Potvrđeno', sortOrder: 7 }),
  definition({ key: 'secret', type: 'text', label: 'Tajni kod', isSensitive: true, sortOrder: 8 }),
]
