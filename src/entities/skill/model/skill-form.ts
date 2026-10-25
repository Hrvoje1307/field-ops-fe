import { z } from 'zod'

import type { Skill, SkillInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface SkillFormValues {
  name: string
}

/** The contract's limit. */
export const SKILL_NAME_MAX = 60

export function buildSkillSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('settings.skills.errors.nameRequired'))
      .max(SKILL_NAME_MAX, t('settings.skills.errors.nameTooLong', { max: SKILL_NAME_MAX })),
  })
}

export function skillFormValues(skill?: Skill): SkillFormValues {
  return { name: skill?.name ?? '' }
}

export function toSkillBody(values: SkillFormValues): SkillInput {
  return { name: values.name.trim() }
}
