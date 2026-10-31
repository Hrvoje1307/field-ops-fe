import { z } from 'zod'

import type { SalesStage, SalesStageInput } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface StageFormValues {
  name: string
  color: string
  kind: 'open' | 'won' | 'lost'
  followUpDays: string
  staleAfterDays: string
  isActive: boolean
}

const DAYS = /^[1-9]\d{0,3}$/

/** The stage form; paths mirror `SalesStageInput`. */
export function buildStageSchema() {
  const t = i18n.t.bind(i18n)
  const days = z
    .string()
    .trim()
    .refine((value) => value === '' || DAYS.test(value), t('sales.stages.daysInvalid'))
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, t('sales.stages.nameRequired'))
      .max(60, t('sales.stages.nameRequired')),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, t('sales.stages.colorInvalid')),
    kind: z.enum(['open', 'won', 'lost']),
    followUpDays: days,
    staleAfterDays: days,
    isActive: z.boolean(),
  })
}

/**
 * The stored stage, or a new open one. A new stage starts in the colour of the stage before
 * it (`fallbackColor`, from the API), so the code holds no palette.
 */
export function stageFormValues(stage?: SalesStage, fallbackColor = ''): StageFormValues {
  return {
    name: stage?.name ?? '',
    color: stage?.color ?? fallbackColor,
    kind: stage?.kind ?? 'open',
    followUpDays: stage?.followUpDays ? String(stage.followUpDays) : '',
    staleAfterDays: stage?.staleAfterDays ? String(stage.staleAfterDays) : '',
    isActive: stage?.isActive ?? true,
  }
}

export function toStageBody(values: StageFormValues): SalesStageInput {
  return {
    name: values.name,
    color: values.color.toLowerCase(),
    kind: values.kind,
    followUpDays: values.followUpDays ? Number(values.followUpDays) : null,
    staleAfterDays: values.staleAfterDays ? Number(values.staleAfterDays) : null,
    isActive: values.isActive,
  }
}

/** The stage ids in the order after moving one place up (-1) or down (+1); unchanged at the ends. */
export function reorderedIds(ids: readonly string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id)
  const to = from + step
  if (from === -1 || to < 0 || to >= ids.length) return [...ids]
  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
