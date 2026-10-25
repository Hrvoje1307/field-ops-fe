import { CustomFieldsSettings } from '@/features/settings/custom-fields'
import type { CustomFieldEntity } from '@/entities/custom-field'

export function SettingsCustomFieldsPage({
  entity,
  onEntityChange,
}: {
  entity: CustomFieldEntity
  onEntityChange: (entity: CustomFieldEntity) => void
}) {
  return <CustomFieldsSettings entity={entity} onEntityChange={onEntityChange} />
}
