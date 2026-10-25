import { apiFetch } from '@/shared/api/api-fetch'
import type { DispatchBoard } from '@/shared/api/generated/model'

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
