import { useTranslation } from 'react-i18next'

import type { SalesStage } from '@/shared/api/generated/model'
import { FieldGroup } from '@/shared/ui/field'
import { SelectField } from '@/shared/ui/select-field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/**
 * The deal's own fields, inside a react-hook-form `FormProvider`. `stages` (the open ones)
 * are offered only when creating; an existing deal changes stage through a move.
 */
export function DealFields({ stages }: { stages?: readonly SalesStage[] }) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <TextField name="title" label={t('sales.deal.fields.title')} required autoComplete="off" />
      {stages && (
        <SelectField
          name="stageId"
          label={t('sales.deal.fields.stage')}
          emptyLabel={t('sales.deal.noStage')}
          options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
        />
      )}
      <FieldRow>
        <TextField
          name="contactName"
          label={t('sales.deal.fields.contactName')}
          autoComplete="off"
        />
        <TextField
          name="contactPhone"
          label={t('sales.deal.fields.contactPhone')}
          type="tel"
          inputMode="tel"
          autoComplete="off"
        />
      </FieldRow>
      <TextField
        name="contactEmail"
        label={t('sales.deal.fields.contactEmail')}
        type="email"
        autoComplete="off"
      />
      <FieldRow>
        <TextField
          name="value"
          label={t('sales.deal.fields.value')}
          inputMode="decimal"
          autoComplete="off"
          hint={t('sales.deal.valueHint')}
        />
        <TextField
          name="expectedCloseDate"
          label={t('sales.deal.fields.expectedCloseDate')}
          type="date"
        />
      </FieldRow>
      <TextField name="notes" label={t('sales.deal.fields.notes')} rows={3} />
    </FieldGroup>
  )
}
