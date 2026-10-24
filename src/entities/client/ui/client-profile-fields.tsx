import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { ClientType } from '@/shared/api/generated/model'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { FieldGroup } from '@/shared/ui/field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

const CLIENT_TYPES: readonly ClientType[] = ['person', 'company']

/**
 * The client record's own fields (type, name, OIB, email, notes), inside a
 * react-hook-form `FormProvider`. Paths mirror `ClientUpdate` under `name` (the form
 * root when empty).
 */
export function ClientProfileFields({ name = '' }: { name?: string }) {
  const { t } = useTranslation()
  const at = (field: string) => (name ? `${name}.${field}` : field)
  const type = useWatch({ name: at('type') }) as ClientType | undefined

  return (
    <FieldGroup>
      <ChoiceGroup
        name={at('type')}
        legend={t('client.typeLabel')}
        choices={CLIENT_TYPES.map((value) => ({ value, label: t(`client.type.${value}`) }))}
      />
      <TextField
        name={at('name')}
        label={type === 'company' ? t('client.name.company') : t('client.name.person')}
        required
        autoComplete="off"
      />
      <FieldRow>
        <TextField
          name={at('oib')}
          label={t('client.oib')}
          inputMode="numeric"
          autoComplete="off"
        />
        <TextField name={at('email')} label={t('client.email')} type="email" autoComplete="off" />
      </FieldRow>
      <TextField name={at('notes')} label={t('client.notes')} rows={2} />
    </FieldGroup>
  )
}
