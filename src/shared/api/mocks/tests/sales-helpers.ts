import { expect, vi } from 'vitest'

import type { MailThread, MailThreadSummary, ProblemDetails } from '@/shared/api/generated/model'

import { getDb } from '../db'
import type { MockDb, TenantData } from '../db/rows'
import type { DealRow, MailThreadRow } from '../db/sales-rows'
import { spec } from '../lib/openapi'
import { MOCK_AI_LATENCY_MS } from '../lib/sales/const'
import { tenantBySlug, type ApiResponse } from './client'

/** Error codes the spec's Sales tag lists (`ProblemDetails.code`). */
export const SPEC_SALES_CODES: ReadonlySet<string> = new Set(
  [
    ...((spec as unknown as { tags: { name: string; description?: string }[] }).tags
      .find((tag) => tag.name === 'Sales')
      ?.description?.matchAll(/\b((?:sales|mailbox|thread)\.[a-z_]+)\b/g) ?? []),
  ].map((match) => match[1] ?? ''),
)

/**
 * Codes the mock uses where the spec says "409" or "403" without naming one, and the
 * generic ones (docs/backend-questions.md #53). Everything else must be in the tag.
 */
export const MOCK_ONLY_CODES: ReadonlySet<string> = new Set([
  'auth.forbidden',
  'not_found',
  'validation_failed',
  'deal.version_conflict',
  'draft.version_conflict',
  'draft.already_sent',
  'draft.not_ready',
])

/** A ProblemDetails of this status and code; the code must be one the spec names (or a known gap). */
export function expectProblem(response: ApiResponse, status: number, code: string): ProblemDetails {
  expect(response.status, JSON.stringify(response.body)).toBe(status)
  const body = response.body as ProblemDetails
  expect(body.code).toBe(code)
  expect(
    SPEC_SALES_CODES.has(code) || MOCK_ONLY_CODES.has(code),
    `${code} is neither in the Sales tag nor a documented gap`,
  ).toBe(true)
  return body
}

export const alarmko = () => tenantBySlug('alarmko')
export const bura = () => tenantBySlug('bura-klima')

export function threadRow(t: TenantData, subject: string): MailThreadRow {
  const row = t.sales.threads.find((th) => th.subject === subject)
  if (!row) throw new Error(`Seed has no thread "${subject}"`)
  return row
}

export function dealRow(t: TenantData, title: string): DealRow {
  const row = t.sales.deals.find((d) => d.title === title)
  if (!row) throw new Error(`Seed has no deal "${title}"`)
  return row
}

export const userId = (db: MockDb, email: string) => {
  const user = db.users.find((u) => u.email === email)
  if (!user) throw new Error(`No user ${email}`)
  return user.id
}

export const dbNow = () => getDb()

/** Moves the clock past the AI's delay so a pending classification or draft finishes. */
export function letAiFinish(): void {
  vi.setSystemTime(new Date(Date.now() + MOCK_AI_LATENCY_MS + 1000))
}

export const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id)
export type { MailThread, MailThreadSummary }
