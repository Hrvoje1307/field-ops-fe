export interface Ordered {
  id: string
  sortOrder: number
}

/**
 * Moving the item at `index` one place up (-1) or down (+1) in a list already in display
 * order: the new `sortOrder` of every item that has to change (10, 20, 30…). Nothing for
 * a move past the ends. Items with equal orders are told apart by the renumbering.
 */
export function moveOrder(
  items: readonly Ordered[],
  index: number,
  direction: -1 | 1,
): { id: string; sortOrder: number }[] {
  const target = index + direction
  if (items[index] === undefined || items[target] === undefined) return []
  const reordered = [...items]
  const moved = reordered[index]
  const other = reordered[target]
  if (!moved || !other) return []
  reordered[index] = other
  reordered[target] = moved
  const current = new Map(items.map((i) => [i.id, i.sortOrder]))
  return reordered
    .map((item, position) => ({ id: item.id, sortOrder: (position + 1) * 10 }))
    .filter((change) => current.get(change.id) !== change.sortOrder)
}
