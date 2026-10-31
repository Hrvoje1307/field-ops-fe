import { ApiError } from '@/shared/api/api-error'
import type { ProblemDetails } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

/**
 * `ProblemDetails.code` of the Sales module → its text (`sales.errors.*` in the i18n file).
 * The codes are the Sales tag's. Two are spelled one way in the tag and another in the
 * operations (docs/backend-questions.md #53), so both spellings are here; drop the one the
 * backend does not use when it decides. The last four are what the mock says where the
 * contract has a bare "409" (no code); they are harmless if the backend never sends them.
 */
export const SALES_ERROR_TEXTS = {
  'sales.not_enabled': 'sales.errors.notEnabled',
  'sales.forbidden': 'sales.errors.forbidden',
  'sales.mailbox_exists': 'sales.errors.mailboxExists',
  'sales.mailbox_needs_reauth': 'sales.errors.mailboxNeedsReauth',
  'mailbox.needs_reauth': 'sales.errors.mailboxNeedsReauth',
  'mailbox.cannot_send': 'sales.errors.cannotSend',
  'mailbox.imap_failed': 'sales.errors.imapFailed',
  'mailbox.smtp_failed': 'sales.errors.smtpFailed',
  'sales.ai_disabled': 'sales.errors.aiDisabled',
  'sales.ai_quota_exceeded': 'sales.errors.aiQuotaExceeded',
  'thread.not_linked': 'sales.errors.threadNotLinked',
  'sales.deal_already_converted': 'sales.errors.dealAlreadyConverted',
  'deal.already_converted': 'sales.errors.dealAlreadyConverted',
  'sales.stage_in_use': 'sales.errors.stageInUse',
  'sales.stage_required': 'sales.errors.stageRequired',
  'sales.lost_reason_required': 'sales.errors.lostReasonRequired',
  'deal.version_conflict': 'sales.errors.versionConflict',
  'draft.version_conflict': 'sales.errors.versionConflict',
  'draft.already_sent': 'sales.errors.draftAlreadySent',
  'draft.not_ready': 'sales.errors.draftNotReady',
  'auth.forbidden': 'sales.errors.notAllowed',
} as const

type SalesErrorCode = keyof typeof SALES_ERROR_TEXTS

const isKnown = (code: string | undefined): code is SalesErrorCode =>
  code !== undefined && code in SALES_ERROR_TEXTS

/** "3 dana", "2 h", "5 min": how long until the allowance is back (seconds in, short text out). */
export function formatWait(seconds: number): string {
  const t = i18n.t.bind(i18n)
  if (seconds >= 86_400) return t('sales.errors.wait.days', { count: Math.ceil(seconds / 86_400) })
  if (seconds >= 3_600) return t('sales.errors.wait.hours', { count: Math.ceil(seconds / 3_600) })
  return t('sales.errors.wait.minutes', { count: Math.max(1, Math.ceil(seconds / 60)) })
}

/**
 * The text for a failed Sales request. The `code` decides, never the wording the server
 * sends; an unknown code (or no code) falls back to a generic line. A connection test
 * adds what the mail server said (`detail`), and an exhausted AI allowance says when to
 * try again (`Retry-After`, in seconds).
 */
export function salesErrorMessage(error: unknown): string {
  const t = i18n.t.bind(i18n)
  if (!(error instanceof ApiError)) return t('sales.errors.generic')
  const problem = error.problem as Partial<ProblemDetails> | undefined
  const code = problem?.code
  if (!isKnown(code)) return t('sales.errors.generic')
  const base = t(SALES_ERROR_TEXTS[code])
  if (code === 'mailbox.imap_failed' || code === 'mailbox.smtp_failed') {
    return problem?.detail
      ? `${base} ${t('sales.errors.serverSaid', { detail: problem.detail })}`
      : base
  }
  if (code === 'sales.ai_quota_exceeded' && error.retryAfter !== null) {
    return `${base} ${t('sales.errors.tryAgainIn', { when: formatWait(error.retryAfter) })}`
  }
  return base
}
