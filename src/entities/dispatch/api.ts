import { useQuery } from '@tanstack/react-query'

import { apiFetch } from '@/shared/api/api-fetch'
import type { DispatchBoard } from '@/shared/api/generated/model'

import { BOARD_STALE_TIME } from './const'

/** Keys start with `dispatch`, which job data invalidation covers. */
export const dispatchKeys = {
  all: ['dispatch'] as const,
  board: (date: string) => ['dispatch', 'board', date] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** A day: a column per active technician with their jobs, and the unassigned queue. */
export async function getDispatchBoard(date: string, signal?: AbortSignal) {
  return apiFetch<DispatchBoard>('/dispatch/board', { query: { date }, signal })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** A day's board; `enabled: false` until the date is valid. */
export function useGetDispatchBoard(date: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: dispatchKeys.board(date),
    queryFn: ({ signal }) => getDispatchBoard(date, signal),
    staleTime: BOARD_STALE_TIME,
    enabled,
  })
}
