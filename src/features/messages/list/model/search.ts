import { z } from 'zod'

import type { ListMessagesParams } from '@/shared/api/generated/model'

export const PAGE_SIZE = 50

export const STATUS_FILTERS = [
  'all',
  'queued',
  'sent',
  'delivered',
  'failed',
  'undeliverable',
] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

/** The message list's URL search params. Invalid values fall back instead of failing. */
export const messagesSearchSchema = z.object({
  status: z.enum(STATUS_FILTERS).default('all').catch('all'),
  page: z.number().int().min(1).default(1).catch(1),
})

export type MessagesSearch = z.infer<typeof messagesSearchSchema>

export type MessagesSearchChange = (patch: Partial<MessagesSearch>) => void

/** Left out of the URL when they have these values. */
export const MESSAGES_SEARCH_DEFAULTS = { status: 'all', page: 1 } as const

/** `GET /messages` params for the search. */
export function toListMessagesParams(search: MessagesSearch): ListMessagesParams {
  return {
    page: search.page,
    pageSize: PAGE_SIZE,
    ...(search.status === 'all' ? {} : { status: search.status }),
  }
}
