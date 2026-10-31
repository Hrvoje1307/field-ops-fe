/** Connecting or pausing a mailbox is rare; its status and last sync change by themselves. */
export const MAILBOXES_STALE_TIME = 30_000

/** While a mailbox is `connecting` its list is read again this often; it stops when none is. */
export const MAILBOX_POLL_MS = 3_000
