import { spec } from '../lib/openapi'

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
 * generic ones of the other areas (docs/backend-questions.md #53).
 */
export const MOCK_ONLY_CODES: ReadonlySet<string> = new Set([
  'auth.forbidden',
  'auth.unauthorized',
  'not_found',
  'validation_failed',
  'deal.version_conflict',
  'draft.version_conflict',
  'draft.already_sent',
  'draft.not_ready',
])

export const isKnownSalesErrorCode = (code: string): boolean =>
  SPEC_SALES_CODES.has(code) || MOCK_ONLY_CODES.has(code)
