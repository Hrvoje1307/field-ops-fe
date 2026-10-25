export interface SettingsSection {
  to: '/settings/company' | '/settings/skills' | '/settings/depots' | '/settings/equipment-types'
  labelKey:
    | 'settings.nav.company'
    | 'settings.nav.skills'
    | 'settings.nav.depots'
    | 'settings.nav.equipmentTypes'
}

/** The sections of the settings area, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { to: '/settings/company', labelKey: 'settings.nav.company' },
  { to: '/settings/skills', labelKey: 'settings.nav.skills' },
  { to: '/settings/depots', labelKey: 'settings.nav.depots' },
  { to: '/settings/equipment-types', labelKey: 'settings.nav.equipmentTypes' },
]
