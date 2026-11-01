import { hasSalesAccess } from '@/entities/auth'
import type { Me } from '@/shared/api/generated/model'

export interface SettingsSection {
  to:
    | '/settings/company'
    | '/settings/job-types'
    | '/settings/checklists'
    | '/settings/custom-fields'
    | '/settings/messages'
    | '/settings/team'
    | '/settings/skills'
    | '/settings/depots'
    | '/settings/equipment-types'
    | '/settings/sales/mailboxes'
    | '/settings/sales/stages'
    | '/settings/sales/follow-up-rules'
    | '/settings/sales/ai'
    | '/settings/sales/digest'
    | '/settings/sales/exclusions'
  labelKey:
    | 'settings.nav.company'
    | 'settings.nav.jobTypes'
    | 'settings.nav.checklists'
    | 'settings.nav.customFields'
    | 'settings.nav.messages'
    | 'settings.nav.team'
    | 'settings.nav.skills'
    | 'settings.nav.depots'
    | 'settings.nav.equipmentTypes'
    | 'settings.nav.salesMailboxes'
    | 'settings.nav.salesStages'
    | 'settings.nav.salesFollowUpRules'
    | 'settings.nav.salesAi'
    | 'settings.nav.salesDigest'
    | 'settings.nav.salesExclusions'
  /** The section belongs to the Sales module: shown only when the user may use it. */
  requiresSales?: boolean
}

/** The sections of the settings area, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { to: '/settings/company', labelKey: 'settings.nav.company' },
  { to: '/settings/job-types', labelKey: 'settings.nav.jobTypes' },
  { to: '/settings/checklists', labelKey: 'settings.nav.checklists' },
  { to: '/settings/custom-fields', labelKey: 'settings.nav.customFields' },
  { to: '/settings/messages', labelKey: 'settings.nav.messages' },
  { to: '/settings/team', labelKey: 'settings.nav.team' },
  { to: '/settings/skills', labelKey: 'settings.nav.skills' },
  { to: '/settings/depots', labelKey: 'settings.nav.depots' },
  { to: '/settings/equipment-types', labelKey: 'settings.nav.equipmentTypes' },
  { to: '/settings/sales/mailboxes', labelKey: 'settings.nav.salesMailboxes', requiresSales: true },
  { to: '/settings/sales/stages', labelKey: 'settings.nav.salesStages', requiresSales: true },
  {
    to: '/settings/sales/follow-up-rules',
    labelKey: 'settings.nav.salesFollowUpRules',
    requiresSales: true,
  },
  { to: '/settings/sales/ai', labelKey: 'settings.nav.salesAi', requiresSales: true },
  { to: '/settings/sales/digest', labelKey: 'settings.nav.salesDigest', requiresSales: true },
  {
    to: '/settings/sales/exclusions',
    labelKey: 'settings.nav.salesExclusions',
    requiresSales: true,
  },
]

/** The sections this user sees: the sales ones only with the module. */
export function settingsSectionsFor(
  me: Pick<Me, 'role' | 'features' | 'canAccessSales'>,
): readonly SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => !section.requiresSales || hasSalesAccess(me))
}
