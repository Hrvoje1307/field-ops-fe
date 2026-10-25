export interface Point {
  x: number
  y: number
}

/** Pen strokes, each a list of points; a one-point stroke is a dot. */
export type Strokes = readonly (readonly Point[])[]

/** Whether anything has been drawn. */
export const hasInk = (strokes: Strokes): boolean => strokes.some((stroke) => stroke.length > 0)

/** Starts a stroke. */
export const startStroke = (strokes: Strokes, point: Point): Strokes => [...strokes, [point]]

/** Adds a point to the stroke being drawn; moves with no stroke started are ignored. */
export function extendStroke(strokes: Strokes, point: Point): Strokes {
  const last = strokes.at(-1)
  if (!last) return strokes
  return [...strokes.slice(0, -1), [...last, point]]
}

/** The last stroke taken back. */
export const undoStroke = (strokes: Strokes): Strokes => strokes.slice(0, -1)

/**
 * The strokes scaled to another canvas size (for a canvas that changed size, e.g.
 * after the phone turned), so what was drawn stays where it was relative to the box.
 */
export function scaleStrokes(
  strokes: Strokes,
  from: { width: number; height: number },
  to: { width: number; height: number },
): Strokes {
  if (from.width === 0 || from.height === 0) return strokes
  const sx = to.width / from.width
  const sy = to.height / from.height
  return strokes.map((stroke) => stroke.map(({ x, y }) => ({ x: x * sx, y: y * sy })))
}
