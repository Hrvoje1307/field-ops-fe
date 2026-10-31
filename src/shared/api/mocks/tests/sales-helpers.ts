import { expect, vi } from 'vitest'

import type { MailThread, MailThreadSummary, ProblemDetails } from '@/shared/api/generated/model'

import { getDb } from '../db'
import type { MockDb, TenantData } from '../db/rows'
import type { DealRow, MailThreadRow } from '../db/sales-rows'
import { MOCK_AI_LATENCY_MS } from '../lib/sales/const'
import { tenantBySlug, type ApiResponse } from './client'
import { isKnownSalesErrorCode } from './sales-codes'

/** A ProblemDetails of this status and code; the code must be one the spec names (or a known gap). */
export function expectProblem(response: ApiResponse, status: number, code: string): ProblemDetails {
  expect(response.status, JSON.stringify(response.body)).toBe(status)
  const body = response.body as ProblemDetails
  expect(body.code).toBe(code)
  expect(
    isKnownSalesErrorCode(code),
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
