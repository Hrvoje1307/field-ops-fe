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
