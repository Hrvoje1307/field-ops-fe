import { useTranslation } from 'react-i18next'

import { FieldGroup } from '@/shared/ui/field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

import { AccessCodesField } from './access-codes-field'

/**
 * A location's fields, inside a react-hook-form `FormProvider`. Paths mirror
 * `LocationInput` under `name` (the form root when empty): street, city, postalCode,
 * label, accessNotes, accessCodes. Access codes are write-only: a plain input for a
 * new location, masked until revealed when editing (`codes="masked"`).
 */
export function LocationFields({
  name = 'location',
  codes = 'plain',
}: {
  name?: string
  codes?: 'plain' | 'masked'
}) {
  const { t } = useTranslation()
  const at = (field: string) => (name ? `${name}.${field}` : field)
  return (
    <FieldGroup>
      <FieldRow>
        <TextField name={at('street')} label={t('location.street')} required autoComplete="off" />
        <TextField name={at('city')} label={t('location.city')} required autoComplete="off" />
      </FieldRow>
      <FieldRow>
        <TextField
          name={at('postalCode')}
          label={t('location.postalCode')}
          inputMode="numeric"
          autoComplete="off"
        />
        <TextField
          name={at('label')}
          label={t('location.label')}
          hint={t('location.labelHint')}
          autoComplete="off"
        />
      </FieldRow>
      <TextField name={at('accessNotes')} label={t('location.accessNotes')} rows={2} />
      {codes === 'masked' ? (
        <AccessCodesField name={at('accessCodes')} />
      ) : (
        <TextField
          name={at('accessCodes')}
          label={t('location.accessCodes')}
          hint={t('location.accessCodesHint')}
          rows={2}
        />
      )}
    </FieldGroup>
  )
}
