import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { ClientType } from '@/shared/api/generated/model'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { FieldGroup } from '@/shared/ui/field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

const CLIENT_TYPES: readonly ClientType[] = ['person', 'company']

/**
 * A new client's own fields, inside a react-hook-form `FormProvider`: type, name, the
 * contact (a company's contact person; a person is their own contact), phone, email
 * and OIB. Paths are `${name}.type`, `${name}.name`, `${name}.contactName`,
 * `${name}.phone`, `${name}.email`, `${name}.oib`.
 */
export function ClientFields({ name = 'client' }: { name?: string }) {
  const { t } = useTranslation()
  const type = useWatch({ name: `${name}.type` }) as ClientType | undefined
  const isCompany = type === 'company'

  return (
    <FieldGroup>
      <ChoiceGroup
        name={`${name}.type`}
        legend={t('client.typeLabel')}
        choices={CLIENT_TYPES.map((value) => ({ value, label: t(`client.type.${value}`) }))}
      />
      <FieldRow>
        <TextField
          name={`${name}.name`}
          label={isCompany ? t('client.name.company') : t('client.name.person')}
          required
          autoComplete="off"
        />
        {isCompany && <TextField name={`${name}.contactName`} label={t('client.contactName')} />}
      </FieldRow>
      <FieldRow>
        <TextField
          name={`${name}.phone`}
          label={t('client.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="off"
        />
        <TextField
          name={`${name}.email`}
          label={t('client.email')}
          type="email"
          autoComplete="off"
        />
      </FieldRow>
      <TextField
        name={`${name}.oib`}
        label={t('client.oib')}
        inputMode="numeric"
        autoComplete="off"
        className="sm:max-w-xs"
      />
    </FieldGroup>
  )
}
