export interface SettingsSection {
  to: '/settings/company'
  labelKey: 'settings.nav.company'
}

/** The sections of the settings area, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { to: '/settings/company', labelKey: 'settings.nav.company' },
]
