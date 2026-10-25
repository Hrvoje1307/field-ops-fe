import type { TFunction } from 'i18next'

import type { ScheduleWarning } from './schedule-warnings'

/** One warning as a sentence (Croatian through i18n). */
export function warningText(t: TFunction, warning: ScheduleWarning): string {
  switch (warning.kind) {
    case 'missingSkills':
      return t('schedule.assign.warnings.missingSkills', {
        name: warning.name,
        skills: warning.skills.join(', '),
      })
    case 'dayOff':
      return t('schedule.assign.warnings.dayOff', { name: warning.name })
    case 'outsideHours':
      return t('schedule.assign.warnings.outsideHours', warning)
    case 'crew':
      return t('schedule.assign.warnings.crew', warning)
    case 'overlap':
      return t('schedule.assign.warnings.overlap', warning)
  }
}
