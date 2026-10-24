import { z } from 'zod'

import type { ListClientsParams } from '@/shared/api/generated/model'

export const PAGE_SIZE = 50

export const TYPE_FILTERS = ['all', 'person', 'company'] as const
export type TypeFilter = (typeof TYPE_FILTERS)[number]

export const SORTS = { name: 'name', newest: '-createdAt' } as const
export type SortName = keyof typeof SORTS
export const SORT_NAMES = Object.keys(SORTS) as SortName[]

/** The client list's URL search params. Invalid values fall back instead of failing. */
export const clientsSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
  type: z.enum(TYPE_FILTERS).default('all').catch('all'),
  sort: z.enum(SORT_NAMES).default('name').catch('name'),
  page: z.number().int().min(1).default(1).catch(1),
})

export type ClientsSearch = z.infer<typeof clientsSearchSchema>

/** Left out of the URL when they have these values. */
export const CLIENTS_SEARCH_DEFAULTS = {
  type: 'all',
  sort: 'name',
  page: 1,
} as const satisfies Partial<ClientsSearch>

export const CLEAR_FILTERS: Partial<ClientsSearch> = { q: undefined, type: undefined, page: 1 }

export function hasActiveFilters(search: ClientsSearch): boolean {
  return Boolean(search.q?.trim()) || search.type !== 'all'
}

/** `GET /clients` params for the search. */
export function toListClientsParams(search: ClientsSearch): ListClientsParams {
  const q = search.q?.trim()
  return {
    ...(q ? { q } : {}),
    ...(search.type === 'all' ? {} : { type: search.type }),
    sort: SORTS[search.sort],
    page: search.page,
    pageSize: PAGE_SIZE,
  }
}
