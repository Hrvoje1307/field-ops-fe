import { createFileRoute } from '@tanstack/react-router'

import { SettingsEquipmentTypesPage } from '@/pages/settings-equipment-types'

export const Route = createFileRoute('/_authed/_office/settings/equipment-types')({
  component: SettingsEquipmentTypesPage,
})
