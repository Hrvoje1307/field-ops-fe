/** A report changes through our own calls (they update the cache). */
export const REPORT_STALE_TIME = 30_000

/** The catalog of materials changes rarely. */
export const CATALOG_STALE_TIME = 5 * 60_000

/** A presigned link lives 5 minutes; asked again a little before. */
export const ATTACHMENT_URL_STALE_TIME = 4 * 60_000

/** The PDF is made in the background after completion: look again every few seconds. */
export const PDF_POLL_MS = 3_000
/** …but not forever. */
export const PDF_POLL_GIVE_UP_MS = 2 * 60_000

/** A deal's files change through our own calls (they refresh the list). */
export const DEAL_FILES_STALE_TIME = 30_000
