import type { Draft } from '@/shared/api/generated/model'

import { DRAFT_POLL_MAX_MS, DRAFT_POLL_MS, DRAFT_POLL_SLOW_MS } from '../const'

/**
 * How soon a draft is read again: only while it is being written, and only as a reserve for
 * the hub's `DraftReady` (slowly when the hub is up), for a limited time after its creation.
 */
export function draftPollInterval(
  draft: Pick<Draft, 'status' | 'createdAt'> | undefined,
  hubLive: boolean,
  now: number = Date.now(),
): number | false {
  if (draft?.status !== 'generating') return false
  if (now - Date.parse(draft.createdAt) > DRAFT_POLL_MAX_MS) return false
  return hubLive ? DRAFT_POLL_SLOW_MS : DRAFT_POLL_MS
}
