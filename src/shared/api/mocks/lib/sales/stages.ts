import type { SalesStageInput } from '@/shared/api/generated/model'

import type { SalesData, SalesStageRow } from '../../db/sales-rows'
import { conflict, FieldErrors, MESSAGES } from '../problems'

/**
 * A tenant with stages always has exactly one active won and one active lost stage
 * (`sales.stage_required`).
 */
export function assertWonAndLost(sales: SalesData): void {
  const live = sales.stages.filter((s) => !s.deletedAt)
  if (live.length === 0) return
  const count = (kind: 'won' | 'lost') => live.filter((s) => s.kind === kind && s.isActive).length
  if (count('won') !== 1 || count('lost') !== 1) {
    throw conflict(
      'sales.stage_required',
      'A tenant needs exactly one active won and one active lost stage.',
    )
  }
}

/** Names are unique per tenant, case-insensitive. */
export function checkStageName(
  sales: SalesData,
  input: SalesStageInput,
  errors: FieldErrors,
  ownId?: string,
): void {
  const name = input.name.trim().toLowerCase()
  if (sales.stages.some((s) => !s.deletedAt && s.id !== ownId && s.name.toLowerCase() === name)) {
    errors.add('name', MESSAGES.duplicate)
  }
}

export const fromInput = (input: SalesStageInput) => ({
  name: input.name.trim(),
  color: input.color,
  kind: input.kind,
  followUpDays: input.followUpDays ?? null,
  staleAfterDays: input.staleAfterDays ?? null,
  isActive: input.isActive,
})

/** Renumbers positions 1..n in the given order. */
export function renumber(stages: SalesStageRow[]): void {
  stages.forEach((stage, index) => {
    stage.position = index + 1
  })
}
