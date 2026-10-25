import { describe, expect, it } from 'vitest'

import { moveOrder } from './order'

const item = (id: string, sortOrder: number) => ({ id, sortOrder })

describe('moveOrder', () => {
  const list = [item('a', 10), item('b', 20), item('c', 30)]

  it('swaps two neighbours and changes only what has to change', () => {
    expect(moveOrder(list, 1, -1)).toEqual([
      { id: 'b', sortOrder: 10 },
      { id: 'a', sortOrder: 20 },
    ])
    expect(moveOrder(list, 1, 1)).toEqual([
      { id: 'c', sortOrder: 20 },
      { id: 'b', sortOrder: 30 },
    ])
  })

  it('does nothing past the ends', () => {
    expect(moveOrder(list, 0, -1)).toEqual([])
    expect(moveOrder(list, 2, 1)).toEqual([])
    expect(moveOrder(list, 5, 1)).toEqual([])
  })

  it('renumbers when orders are equal or odd, so the move shows', () => {
    const tied = [item('a', 10), item('b', 10), item('c', 10)]
    const changes = moveOrder(tied, 2, -1)
    const after = new Map(tied.map((i) => [i.id, i.sortOrder]))
    for (const change of changes) after.set(change.id, change.sortOrder)
    const order = [...after.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)
    expect(order).toEqual(['a', 'c', 'b'])
    expect(new Set(after.values()).size).toBe(3)
  })

  it('moving down is the same as moving the next one up', () => {
    expect(moveOrder(list, 0, 1)).toEqual(moveOrder(list, 1, -1))
  })
})
