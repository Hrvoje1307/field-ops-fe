import { describe, expect, it } from 'vitest'

import { extendStroke, hasInk, scaleStrokes, startStroke, undoStroke } from './strokes'

describe('strokes', () => {
  it('nothing drawn is no ink; a touch is a dot', () => {
    expect(hasInk([])).toBe(false)
    expect(hasInk([[]])).toBe(false)
    expect(hasInk(startStroke([], { x: 1, y: 2 }))).toBe(true)
  })

  it('extends the stroke being drawn, and ignores moves before a start', () => {
    const start = startStroke([], { x: 0, y: 0 })
    const drawn = extendStroke(start, { x: 5, y: 5 })
    expect(drawn).toEqual([
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
    ])
    expect(extendStroke([], { x: 1, y: 1 })).toEqual([])
    // the input is not changed
    expect(start).toEqual([[{ x: 0, y: 0 }]])
  })

  it('a new stroke starts after the last, and undo takes the last back', () => {
    const two = startStroke(extendStroke(startStroke([], { x: 0, y: 0 }), { x: 1, y: 1 }), {
      x: 9,
      y: 9,
    })
    expect(two).toHaveLength(2)
    expect(undoStroke(two)).toHaveLength(1)
    expect(undoStroke([])).toEqual([])
  })

  it('scales to a new size keeping the place in the box', () => {
    const scaled = scaleStrokes(
      [[{ x: 100, y: 50 }]],
      { width: 200, height: 100 },
      { width: 400, height: 50 },
    )
    expect(scaled).toEqual([[{ x: 200, y: 25 }]])
    const same = [[{ x: 1, y: 1 }]]
    expect(scaleStrokes(same, { width: 0, height: 0 }, { width: 10, height: 10 })).toBe(same)
  })
})
