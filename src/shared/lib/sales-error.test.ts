import { describe, expect, it } from 'vitest'

import { ApiError } from '@/shared/api/api-error'
import { i18n } from '@/shared/i18n'

import { isKnownSalesErrorCode, SPEC_SALES_CODES } from '../api/mocks/tests/sales-codes'
import { formatWait, SALES_ERROR_TEXTS, salesErrorMessage } from './sales-error'

const problem = (status: number, code?: string, extra: object = {}, retryAfter?: number) =>
  new ApiError(
    status,
    { status, title: 'x', ...(code ? { code } : {}), ...extra },
    {
      retryAfter: retryAfter ?? null,
    },
  )

describe('salesErrorMessage', () => {
  it('has a text for every code the spec’s Sales tag names', () => {
    expect(SPEC_SALES_CODES.size).toBeGreaterThanOrEqual(14)
    for (const code of SPEC_SALES_CODES) {
      expect(Object.keys(SALES_ERROR_TEXTS), `no text for ${code}`).toContain(code)
    }
  })

  it('every code in the map is the tag’s, a spelling the operations use, or one the mock sends; every text exists', () => {
    // as the operations spell them (#53)
    const operationSpellings = ['deal.already_converted', 'mailbox.needs_reauth']
    for (const [code, key] of Object.entries(SALES_ERROR_TEXTS)) {
      expect(
        isKnownSalesErrorCode(code) || operationSpellings.includes(code),
        `${code} is nowhere in the contract or the mock`,
      ).toBe(true)
      expect(i18n.exists(key), `${key} is missing in hr.ts`).toBe(true)
    }
  })

  it('both spellings of the two codes the tag and the operations disagree on say the same', () => {
    expect(salesErrorMessage(problem(409, 'deal.already_converted'))).toBe(
      salesErrorMessage(problem(409, 'sales.deal_already_converted')),
    )
    expect(salesErrorMessage(problem(409, 'mailbox.needs_reauth'))).toBe(
      salesErrorMessage(problem(409, 'sales.mailbox_needs_reauth')),
    )
    expect(salesErrorMessage(problem(409, 'sales.mailbox_needs_reauth'))).toBe(
      'Sandučić treba ponovno spojiti.',
    )
  })

  it('the code decides, not the server’s wording', () => {
    expect(salesErrorMessage(problem(403, 'sales.forbidden', { detail: 'Zabranjeno' }))).toBe(
      'Nemate pristup prodaji.',
    )
  })

  it('an unknown code, no code, or something that is not an API error falls back', () => {
    const generic = 'Radnju nije moguće obaviti. Pokušajte ponovno.'
    expect(salesErrorMessage(problem(409, 'sales.something_new'))).toBe(generic)
    expect(salesErrorMessage(problem(500))).toBe(generic)
    expect(salesErrorMessage(new Error('network'))).toBe(generic)
    expect(salesErrorMessage(undefined)).toBe(generic)
  })

  it('a failed connection test adds what the mail server said', () => {
    expect(
      salesErrorMessage(problem(422, 'mailbox.imap_failed', { detail: 'Authentication failed.' })),
    ).toBe(
      'Spajanje na dolaznu poštu (IMAP) nije uspjelo. Poslužitelj kaže: Authentication failed.',
    )
    expect(salesErrorMessage(problem(422, 'mailbox.smtp_failed'))).toBe(
      'Spajanje na odlaznu poštu (SMTP) nije uspjelo.',
    )
  })

  it('an exhausted AI allowance says when to try again (Retry-After in seconds)', () => {
    expect(salesErrorMessage(problem(429, 'sales.ai_quota_exceeded', {}, 90))).toBe(
      'Mjesečna AI kvota je potrošena. Pokušajte ponovno za 2 minute.',
    )
    expect(salesErrorMessage(problem(429, 'sales.ai_quota_exceeded'))).toBe(
      'Mjesečna AI kvota je potrošena.',
    )
  })
})

describe('formatWait', () => {
  it('rounds up to the unit that fits', () => {
    expect(formatWait(30)).toBe('1 minutu')
    expect(formatWait(5 * 60)).toBe('5 minuta')
    expect(formatWait(3 * 3600 + 1)).toBe('4 sata')
    expect(formatWait(3600)).toBe('1 sat')
    expect(formatWait(86_400)).toBe('1 dan')
    expect(formatWait(20 * 86_400)).toBe('20 dana')
  })
})
