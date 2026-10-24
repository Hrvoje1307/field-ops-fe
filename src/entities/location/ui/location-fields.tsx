import { useTranslation } from 'react-i18next'

import { FieldGroup } from '@/shared/ui/field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/**
 * A new location's fields, inside a react-hook-form `FormProvider`. Paths mirror
 * `LocationInput` under `name`: street, city, postalCode, label, accessNotes,
 * accessCodes. Access codes are write-only: typed here, shown masked elsewhere.
 */
export function LocationFields({ name = 'location' }: { name?: string }) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <FieldRow>
        <TextField
          name={`${name}.street`}
          label={t('location.street')}
          required
          autoComplete="off"
        />
        <TextField name={`${name}.city`} label={t('location.city')} required autoComplete="off" />
      </FieldRow>
      <FieldRow>
        <TextField
          name={`${name}.postalCode`}
          label={t('location.postalCode')}
          inputMode="numeric"
          autoComplete="off"
        />
        <TextField
          name={`${name}.label`}
          label={t('location.label')}
          hint={t('location.labelHint')}
          autoComplete="off"
        />
      </FieldRow>
      <TextField name={`${name}.accessNotes`} label={t('location.accessNotes')} rows={2} />
      <TextField
        name={`${name}.accessCodes`}
        label={t('location.accessCodes')}
        hint={t('location.accessCodesHint')}
        rows={2}
      />
    </FieldGroup>
  )
}
