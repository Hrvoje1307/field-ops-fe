import type { Message } from '@/shared/api/generated/model'

import { MESSAGE_PENDING_MAX_AGE_MS } from '../const'

/** Queued or sent, not yet delivered or failed: its status will still change. */
export function isOnItsWay(
  message: Pick<Message, 'status' | 'createdAt'>,
  now: number = Date.now(),
): boolean {
  if (message.status !== 'queued' && message.status !== 'sent') return false
  return now - Date.parse(message.createdAt) < MESSAGE_PENDING_MAX_AGE_MS
}

/** Failed, or refused by the operator or the mailbox. */
export const isFailure = (message: Pick<Message, 'status'>) =>
  message.status === 'failed' || message.status === 'undeliverable'
