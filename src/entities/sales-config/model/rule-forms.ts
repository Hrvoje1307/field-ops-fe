import { z } from 'zod'

import type {
  ExclusionRuleInput,
  FollowUpRule,
  FollowUpRuleInput,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

/** `ExclusionRuleInput.pattern` as the spec writes it: `name@example.com` or `@example.com`. */
export const EXCLUSION_PATTERN = /^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$/

export const FOLLOW_UP_DAYS_MIN = 1
export const FOLLOW_UP_DAYS_MAX = 90

// --- Follow-up rules --------------------------------------------------------------------

export interface RuleFormValues {
  name: string
  /** "" = all open stages. */
  stageId: string
  daysWithoutReply: string
  createDraft: boolean
  isActive: boolean
}

export function buildRuleSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    name: z.string().trim().min(1, t('sales.rules.nameRequired')),
    stageId: z.string(),
    daysWithoutReply: z
      .string()
      .trim()
      .refine(
        (value) =>
          /^\d{1,3}$/.test(value) &&
          Number(value) >= FOLLOW_UP_DAYS_MIN &&
          Number(value) <= FOLLOW_UP_DAYS_MAX,
        t('sales.rules.daysInvalid', { min: FOLLOW_UP_DAYS_MIN, max: FOLLOW_UP_DAYS_MAX }),
      ),
    createDraft: z.boolean(),
    isActive: z.boolean(),
  })
}

export function ruleFormValues(rule?: FollowUpRule): RuleFormValues {
  return {
    name: rule?.name ?? '',
    stageId: rule?.stageId ?? '',
    daysWithoutReply: rule ? String(rule.daysWithoutReply) : '',
    createDraft: rule?.createDraft ?? false,
    isActive: rule?.isActive ?? true,
  }
}

export function toRuleBody(values: RuleFormValues): FollowUpRuleInput {
  return {
    name: values.name.trim(),
    stageId: values.stageId === '' ? null : values.stageId,
    daysWithoutReply: Number(values.daysWithoutReply),
    createDraft: values.createDraft,
    isActive: values.isActive,
  }
}

// --- Exclusions ---------------------------------------------------------------------------

export interface ExclusionFormValues {
  pattern: string
  note: string
}

export function buildExclusionSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    pattern: z.string().trim().regex(EXCLUSION_PATTERN, t('sales.exclusions.patternInvalid')),
    note: z.string(),
  })
}

export const emptyExclusion = (): ExclusionFormValues => ({ pattern: '', note: '' })

export function toExclusionBody(values: ExclusionFormValues): ExclusionRuleInput {
  return {
    pattern: values.pattern.trim(),
    note: values.note.trim() === '' ? null : values.note.trim(),
  }
}
