/** An item dropped into a list (a column of cards, a route of stops). */
export interface DragMove {
  itemId: string
  fromId: string
  toId: string
  /** Position in the target list once the item has left its old place. */
  index: number
}

export type DragLayout = Readonly<Record<string, readonly string[]>>

/**
 * Where a dropped item goes. `over` is what the pointer is above: another item (put
 * before it, or after it when dragged below its middle) or an empty part of a list
 * (put last). Returns `null` when nothing changes.
 */
export function resolveMove(
  layout: DragLayout,
  active: { id: string; containerId: string },
  over: { id: string; containerId: string; isList: boolean; below: boolean },
): DragMove | null {
  const toId = over.containerId
  const rest = (layout[toId] ?? []).filter((id) => id !== active.id)
  let index: number
  if (over.isList) {
    index = rest.length
  } else {
    if (over.id === active.id) return null
    const overIndex = rest.indexOf(over.id)
    if (overIndex === -1) return null
    index = overIndex + (over.below ? 1 : 0)
  }
  if (toId === active.containerId) {
    const was = (layout[toId] ?? []).indexOf(active.id)
    if (was === index) return null
  }
  return { itemId: active.id, fromId: active.containerId, toId, index }
}

/** The lists after a move (for a preview, or to send the whole order). */
export function applyMove(layout: DragLayout, move: DragMove): Record<string, string[]> {
  const next: Record<string, string[]> = {}
  for (const [id, items] of Object.entries(layout)) {
    next[id] = items.filter((item) => item !== move.itemId)
  }
  const target = next[move.toId] ?? []
  target.splice(move.index, 0, move.itemId)
  next[move.toId] = target
  return next
}

const COPY_SEPARATOR = '@'

/**
 * The same thing can sit in several lists (a job for two technicians is on both their
 * days); the drag lists need an id per place, so extra copies are `id@listId`.
 */
export function copyId(id: string, listId: string): string {
  return `${id}${COPY_SEPARATOR}${listId}`
}

/** The id of the thing behind an item id (copy or not). */
export function baseId(itemId: string): string {
  return itemId.split(COPY_SEPARATOR)[0] ?? itemId
}

export function isCopy(itemId: string): boolean {
  return itemId.includes(COPY_SEPARATOR)
}

/** Item ids for lists of ids: those that appear in more than one list become copies. */
export function withCopies(
  lists: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const counts = new Map<string, number>()
  for (const ids of Object.values(lists)) {
    for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return Object.fromEntries(
    Object.entries(lists).map(([listId, ids]) => [
      listId,
      ids.map((id) => ((counts.get(id) ?? 0) > 1 ? copyId(id, listId) : id)),
    ]),
  )
}
