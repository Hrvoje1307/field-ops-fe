/** The day's plan changes often: refetched every time the board is shown. */
export const BOARD_STALE_TIME = 0

/** A plan only changes through our own calls (they update the cache). */
export const ROUTE_PLAN_STALE_TIME = 30_000
