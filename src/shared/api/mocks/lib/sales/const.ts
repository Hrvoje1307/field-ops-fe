/**
 * What the mock decides for the backend in the Sales module. Real values belong to the
 * backend (plan, provider, model); the frontend never reads these, it only reacts to the
 * responses they produce.
 */

/**
 * AI actions (classifications + drafts) a tenant may use per month before the mock answers
 * 429 `sales.ai_quota_exceeded`. The real allowance is decided by the backend and the plan;
 * the frontend never computes a quota, it only reacts to the 429.
 */
export const MOCK_AI_MONTHLY_LIMIT = 200

/** How long a classification or a draft stays "pending" / "generating". */
export const MOCK_AI_LATENCY_MS = 2500

/** The model name the mock reports on what it "generated". */
export const MOCK_AI_MODEL = 'mock-model'

/** OAuth connections wait this long for the provider's redirect (spec: 10 min). */
export const OAUTH_STATE_TTL_MS = 10 * 60_000

/** A newly connected mailbox is `connecting` this long before its first sync is done. */
export const MOCK_CONNECT_MS = 4000

/** Won and lost columns of the board hold the last 30 days (spec). */
export const BOARD_CLOSED_DAYS = 30

export const BOARD_DEFAULT_PER_STAGE = 50
