import type { RoutePlan, UpdateRoutePlanBodyRoutesItem } from '@/entities/dispatch'
import { baseId, withCopies } from '@/shared/lib/drag-move'

/** The list of jobs the plan could not place. */
export const UNASSIGNED_ID = 'unassigned'

/**
 * The plan as lists of item ids: a list per technician (visit order) and the unplaced
 * jobs. `technicianIds` are the columns to show, so a technician without a route can
 * still receive jobs.
 */
export function planLayout(
  plan: Pick<RoutePlan, 'routes' | 'unassigned'>,
  technicianIds: readonly string[],
): Record<string, string[]> {
  const layout: Record<string, string[]> = {}
  for (const id of technicianIds) layout[id] = []
  for (const route of plan.routes) {
    const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence)
    layout[route.technicianId] = [
      ...(layout[route.technicianId] ?? []),
      ...stops.map((stop) => stop.jobId),
    ]
  }
  layout[UNASSIGNED_ID] = plan.unassigned.map((item) => item.jobId)
  return withCopies(layout)
}

/** What `PUT /route-plans/{id}` gets: every technician's route, empty ones left out. */
export function routesFromLayout(
  layout: Readonly<Record<string, readonly string[]>>,
): UpdateRoutePlanBodyRoutesItem[] {
  return Object.entries(layout)
    .filter(([id, items]) => id !== UNASSIGNED_ID && items.length > 0)
    .map(([technicianId, items]) => ({ technicianId, jobIds: items.map(baseId) }))
}
