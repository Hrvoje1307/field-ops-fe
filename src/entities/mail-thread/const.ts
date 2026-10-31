/** The inbox changes with every sync; events refresh it, this is only the floor. */
export const MAIL_THREADS_STALE_TIME = 15_000
export const MAIL_THREAD_DETAIL_STALE_TIME = 15_000

/** While the AI works on a thread (`pending`) it is read again this often. */
export const MAIL_THREAD_POLL_MS = 3_000
