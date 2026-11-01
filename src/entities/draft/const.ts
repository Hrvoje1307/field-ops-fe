export const DRAFT_LIST_STALE_TIME = 15_000
export const DRAFT_DETAIL_STALE_TIME = 10_000
/** The fallback while the hub is not connected (the spec allows polling the draft). */
export const DRAFT_POLL_MS = 3_000

/**
 * While a draft is being written the hub's `DraftReady` ends the wait. This is the reserve in
 * case it does not come: read again every 10 s while the hub is connected, every 3 s while it
 * is not, and no longer than this after the draft was created.
 */
export const DRAFT_POLL_SLOW_MS = 10_000
export const DRAFT_POLL_MAX_MS = 120_000
