/** Events that arrive within this many ms of each other refresh the data once. */
export const REFRESH_COALESCE_MS = 200

/** A write made here echoes back from the hub within this time: it is our own. */
export const OWN_WRITE_WINDOW_MS = 3000
