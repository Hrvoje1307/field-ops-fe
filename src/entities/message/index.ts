export type {
  ListMessagesParams,
  Message,
  MessagePage,
  MessageStatus,
  NotifyClientBody,
} from '@/shared/api/generated/model'
export { listMessages, messageKeys, notifyClient, useListMessages, useNotifyClient } from './api'
export { addressOf, canReach, recipientsOf } from './lib/recipients'
export { isFailure, isOnItsWay } from './lib/status'
export {
  buildNotifySchema,
  emptyNotify,
  type NotifyFormValues,
  toNotifyBody,
} from './model/notify-form'
export { MessageStatusBadge } from './ui/message-status-badge'
