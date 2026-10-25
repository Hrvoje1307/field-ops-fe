import { z } from 'zod'

import type { JobType, JobTypeInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface JobTypeFormValues {
  name: string
  color: string
  defaultDurationMin: string
  requiredPeople: string
  requiredSkillIds: string[]
  /** Empty for no checklist. */
  checklistTemplateId: string
  smsEnabled: boolean
  isActive: boolean
}

/** The contract's limits. */
export const MIN_DURATION_MIN = 5
export const MAX_PEOPLE = 10

const COLOR = /^#[0-9a-fA-F]{6}$/

export function buildJobTypeSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    name: z.string().trim().min(1, t('settings.jobTypes.errors.nameRequired')),
    color: z.string().trim().regex(COLOR, t('settings.jobTypes.errors.colorInvalid')),
    defaultDurationMin: z
      .string()
      .trim()
      .refine(
        (value) => /^\d{1,4}$/.test(value) && Number(value) >= MIN_DURATION_MIN,
        t('settings.jobTypes.errors.durationInvalid', { min: MIN_DURATION_MIN }),
      ),
    requiredPeople: z
      .string()
      .trim()
      .refine(
        (value) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_PEOPLE,
        t('settings.jobTypes.errors.peopleInvalid', { max: MAX_PEOPLE }),
      ),
    requiredSkillIds: z.array(z.string()),
    checklistTemplateId: z.string(),
    smsEnabled: z.boolean(),
    isActive: z.boolean(),
  })
}

/** A new job type starts active, an hour long, for one person, with SMS on. */
export function jobTypeFormValues(jobType?: JobType): JobTypeFormValues {
  if (!jobType) {
    return {
      name: '',
      color: '#2563eb',
      defaultDurationMin: '60',
      requiredPeople: '1',
      requiredSkillIds: [],
      checklistTemplateId: '',
      smsEnabled: true,
      isActive: true,
    }
  }
  return {
    name: jobType.name,
    color: jobType.color,
    defaultDurationMin: String(jobType.defaultDurationMin),
    requiredPeople: String(jobType.requiredPeople),
    requiredSkillIds: [...jobType.requiredSkillIds],
    checklistTemplateId: jobType.checklistTemplateId ?? '',
    smsEnabled: jobType.smsEnabled,
    isActive: jobType.isActive,
  }
}

export function toJobTypeBody(values: JobTypeFormValues): JobTypeInput {
  return {
    name: values.name.trim(),
    color: values.color.trim().toLowerCase(),
    defaultDurationMin: Number(values.defaultDurationMin),
    requiredPeople: Number(values.requiredPeople),
    requiredSkillIds: values.requiredSkillIds,
    checklistTemplateId: values.checklistTemplateId === '' ? null : values.checklistTemplateId,
    smsEnabled: values.smsEnabled,
    isActive: values.isActive,
  }
}
