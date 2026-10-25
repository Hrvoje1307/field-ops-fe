export interface SettingsSection {
  to:
    | '/settings/company'
    | '/settings/job-types'
    | '/settings/checklists'
    | '/settings/custom-fields'
    | '/settings/skills'
    | '/settings/depots'
    | '/settings/equipment-types'
  labelKey:
    | 'settings.nav.company'
    | 'settings.nav.jobTypes'
    | 'settings.nav.checklists'
    | 'settings.nav.customFields'
    | 'settings.nav.skills'
    | 'settings.nav.depots'
    | 'settings.nav.equipmentTypes'
}

/** The sections of the settings area, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { to: '/settings/company', labelKey: 'settings.nav.company' },
  { to: '/settings/job-types', labelKey: 'settings.nav.jobTypes' },
  { to: '/settings/checklists', labelKey: 'settings.nav.checklists' },
  { to: '/settings/custom-fields', labelKey: 'settings.nav.customFields' },
  { to: '/settings/skills', labelKey: 'settings.nav.skills' },
  { to: '/settings/depots', labelKey: 'settings.nav.depots' },
  { to: '/settings/equipment-types', labelKey: 'settings.nav.equipmentTypes' },
]
