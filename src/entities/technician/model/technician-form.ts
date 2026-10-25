import { z } from 'zod'

import type { Technician, TechnicianCreate, TechnicianUpdate } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface TechnicianFormValues {
  color: string
  workStart: string
  workEnd: string
  /** ISO weekdays, 1 = Monday. */
  workingDays: number[]
  /** Empty for no depot. */
  depotId: string
  skillIds: string[]
  isActive: boolean
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^#[0-9a-fA-F]{6}$/

export function buildTechnicianSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      color: z.string().trim().regex(COLOR, t('settings.team.technician.errors.colorInvalid')),
      workStart: z.string().trim().regex(TIME, t('settings.team.technician.errors.timeInvalid')),
      workEnd: z.string().trim().regex(TIME, t('settings.team.technician.errors.timeInvalid')),
      workingDays: z.array(z.number().int().min(1).max(7)),
      depotId: z.string(),
      skillIds: z.array(z.string()),
      isActive: z.boolean(),
    })
    .superRefine((values, context) => {
      if (
        TIME.test(values.workStart) &&
        TIME.test(values.workEnd) &&
        values.workEnd <= values.workStart
      ) {
        context.addIssue({
          code: 'custom',
          path: ['workEnd'],
          message: t('settings.team.technician.errors.endBeforeStart'),
        })
      }
      if (values.workingDays.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['workingDays'],
          message: t('settings.team.technician.errors.daysRequired'),
        })
      }
    })
}

/** A new technician works on weekdays from 8 to 16, active, with no depot or skills yet. */
export function technicianFormValues(technician?: Technician): TechnicianFormValues {
  if (!technician) {
    return {
      color: '#2563eb',
      workStart: '08:00',
      workEnd: '16:00',
      workingDays: [1, 2, 3, 4, 5],
      depotId: '',
      skillIds: [],
      isActive: true,
    }
  }
  return {
    color: technician.color,
    workStart: technician.workStart,
    workEnd: technician.workEnd,
    workingDays: [...technician.workingDays].sort((a, b) => a - b),
    depotId: technician.depotId ?? '',
    skillIds: [...technician.skillIds],
    isActive: technician.isActive,
  }
}

export function toTechnicianBody(values: TechnicianFormValues): TechnicianUpdate {
  return {
    depotId: values.depotId === '' ? null : values.depotId,
    color: values.color.trim().toLowerCase(),
    workStart: values.workStart.trim(),
    workEnd: values.workEnd.trim(),
    workingDays: [...new Set(values.workingDays)].sort((a, b) => a - b),
    skillIds: values.skillIds,
    isActive: values.isActive,
  }
}

/** The same working data for the member (`userId`) who becomes a technician. */
export function toTechnicianCreateBody(
  userId: string,
  values: TechnicianFormValues,
): TechnicianCreate {
  return { userId, ...toTechnicianBody(values) }
}
