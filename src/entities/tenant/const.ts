/** Name, time zone, locale and currency change rarely. */
export const TENANT_STALE_TIME = 5 * 60_000

/** Counters grow as messages go out; a minute is fresh enough for a settings screen. */
export const TENANT_USAGE_STALE_TIME = 60_000
