import { useTranslation } from 'react-i18next'

import type { AssetType } from '@/shared/api/generated/model'
import { FieldGroup } from '@/shared/ui/field'
import { SelectField } from '@/shared/ui/select-field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/**
 * Equipment fields inside a react-hook-form `FormProvider`; paths mirror `AssetInput`.
 * The tenant's asset types come in from the caller (entities don't fetch).
 */
export function AssetFields({ assetTypes }: { assetTypes: readonly AssetType[] }) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <SelectField
        name="assetTypeId"
        label={t('asset.fields.type')}
        emptyLabel={t('asset.fields.chooseType')}
        required
        options={[...assetTypes]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((type) => ({ value: type.id, label: type.name }))}
      />
      <FieldRow>
        <TextField name="manufacturer" label={t('asset.fields.manufacturer')} autoComplete="off" />
        <TextField name="model" label={t('asset.fields.model')} autoComplete="off" />
      </FieldRow>
      <TextField
        name="serialNo"
        label={t('asset.fields.serialNo')}
        autoComplete="off"
        className="sm:max-w-sm"
      />
      <FieldRow>
        <TextField name="installedAt" label={t('asset.fields.installedAt')} type="date" />
        <TextField name="warrantyUntil" label={t('asset.fields.warrantyUntil')} type="date" />
      </FieldRow>
      <TextField name="notes" label={t('asset.fields.notes')} rows={2} />
    </FieldGroup>
  )
}
