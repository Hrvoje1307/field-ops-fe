import { describe, expect, it } from 'vitest'

import { applyMove, resolveMove } from './drag-move'

const layout = { queue: ['q1', 'q2'], a: ['a1', 'a2', 'a3'], b: [] }

describe('resolveMove', () => {
  it('puts the item before the one it is over, or after it when dragged below its middle', () => {
    const active = { id: 'q1', containerId: 'queue' }
    expect(
      resolveMove(layout, active, { id: 'a2', containerId: 'a', isList: false, below: false }),
    ).toEqual({ itemId: 'q1', fromId: 'queue', toId: 'a', index: 1 })
    expect(
      resolveMove(layout, active, { id: 'a2', containerId: 'a', isList: false, below: true }),
    ).toEqual({ itemId: 'q1', fromId: 'queue', toId: 'a', index: 2 })
  })

  it('puts the item last when it is dropped on the list itself, also an empty one', () => {
    const active = { id: 'q1', containerId: 'queue' }
    expect(
      resolveMove(layout, active, { id: 'b', containerId: 'b', isList: true, below: false }),
    ).toEqual({ itemId: 'q1', fromId: 'queue', toId: 'b', index: 0 })
    expect(
      resolveMove(layout, active, { id: 'a', containerId: 'a', isList: true, below: false }),
    ).toEqual({ itemId: 'q1', fromId: 'queue', toId: 'a', index: 3 })
  })

  it('reorders inside a list, counting without the item itself', () => {
    const active = { id: 'a1', containerId: 'a' }
    // below a3: last (index 2 once a1 has left)
    expect(
      resolveMove(layout, active, { id: 'a3', containerId: 'a', isList: false, below: true }),
    ).toEqual({ itemId: 'a1', fromId: 'a', toId: 'a', index: 2 })
    // above a3: between a2 and a3
    expect(
      resolveMove(layout, active, { id: 'a3', containerId: 'a', isList: false, below: false }),
    ).toEqual({ itemId: 'a1', fromId: 'a', toId: 'a', index: 1 })
  })

  it('is null when nothing changes', () => {
    const active = { id: 'a2', containerId: 'a' }
    expect(
      resolveMove(layout, active, { id: 'a2', containerId: 'a', isList: false, below: true }),
    ).toBeNull()
    // dropped just after its own predecessor: still second
    expect(
      resolveMove(layout, active, { id: 'a1', containerId: 'a', isList: false, below: true }),
    ).toBeNull()
    // on the list itself while already last
    expect(
      resolveMove(
        layout,
        { id: 'a3', containerId: 'a' },
        {
          id: 'a',
          containerId: 'a',
          isList: true,
          below: false,
        },
      ),
    ).toBeNull()
  })

  it('is null for an item that is not in the list it points at', () => {
    expect(
      resolveMove(
        layout,
        { id: 'q1', containerId: 'queue' },
        {
          id: 'zz',
          containerId: 'a',
          isList: false,
          below: false,
        },
      ),
    ).toBeNull()
  })
})

describe('applyMove', () => {
  it('moves the item between lists and leaves the input alone', () => {
    const next = applyMove(layout, { itemId: 'q1', fromId: 'queue', toId: 'a', index: 1 })
    expect(next).toEqual({ queue: ['q2'], a: ['a1', 'q1', 'a2', 'a3'], b: [] })
    expect(layout.queue).toEqual(['q1', 'q2'])
  })

  it('reorders in one list', () => {
    expect(applyMove(layout, { itemId: 'a1', fromId: 'a', toId: 'a', index: 2 }).a).toEqual([
      'a2',
      'a3',
      'a1',
    ])
  })
})
