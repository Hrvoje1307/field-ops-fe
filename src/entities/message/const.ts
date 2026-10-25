/** Messages change only as they go out; a little while is fresh enough. */
export const MESSAGES_STALE_TIME = 30_000

/** While a message is on its way the list is looked at again this often. */
export const MESSAGE_POLL_MS = 3000

/** A message not yet delivered after this long is left alone: it is stuck, not on its way. */
export const MESSAGE_PENDING_MAX_AGE_MS = 10 * 60_000
