import { cn } from 'cn'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { extendStroke, hasInk, scaleStrokes, startStroke, type Strokes } from '@/shared/lib/strokes'

export interface SignaturePadHandle {
  clear: () => void
  /** The drawing as a PNG on white; null when nothing was drawn (or canvas is unsupported). */
  toBlob: () => Promise<Blob | null>
}

const PEN_WIDTH = 2.5

function paint(canvas: HTMLCanvasElement, strokes: Strokes, background: string | null) {
  const context = canvas.getContext('2d')
  if (!context) return
  const ratio = canvas.width / (canvas.clientWidth || canvas.width)
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.lineWidth = PEN_WIDTH
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#111827'
  context.fillStyle = '#111827'
  for (const stroke of strokes) {
    const [first] = stroke
    if (!first) continue
    if (stroke.length === 1) {
      context.beginPath()
      context.arc(first.x, first.y, PEN_WIDTH / 2, 0, Math.PI * 2)
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(first.x, first.y)
    for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
}

/**
 * A box to sign in with a finger or a pen. The drawing is kept as strokes, so it
 * survives the box changing size; `onInkChange` says whether anything is drawn.
 */
export function SignaturePad({
  ref,
  onInkChange,
  label,
  className,
}: {
  ref?: Ref<SignaturePadHandle>
  onInkChange?: (hasInk: boolean) => void
  /** Accessible name of the drawing area. */
  label: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [strokes, setStrokes] = useState<Strokes>([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const drawing = useRef(false)
  const strokesRef = useRef(strokes)

  // The latest strokes for the resize observer and the export (they outlive a render)
  useEffect(() => {
    strokesRef.current = strokes
  }, [strokes])

  // Match the canvas to its box (and the screen's pixel density); redraw on resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fit = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0 || height === 0) return
      const density = window.devicePixelRatio || 1
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      const scaled = scaleStrokes(strokesRef.current, sizeRef.current, { width, height })
      sizeRef.current = { width, height }
      if (scaled !== strokesRef.current) setStrokes(scaled)
      else paint(canvas, scaled, null)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (canvasRef.current) paint(canvasRef.current, strokes, null)
    onInkChange?.(hasInk(strokes))
    // onInkChange is a callback of the parent; the drawing is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes])

  useImperativeHandle(ref, () => ({
    clear: () => {
      setStrokes([])
    },
    toBlob: () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current
        if (!canvas || !hasInk(strokesRef.current) || typeof canvas.toBlob !== 'function') {
          resolve(null)
          return
        }
        // Signatures are printed on white
        const copy = document.createElement('canvas')
        copy.width = canvas.width
        copy.height = canvas.height
        paint(copy, strokesRef.current, '#ffffff')
        copy.toBlob(resolve, 'image/png')
      }),
  }))

  const pointOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      data-testid="signature-pad"
      className={cn(
        'h-44 w-full cursor-crosshair touch-none rounded-lg border bg-white',
        className,
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drawing.current = true
        const point = pointOf(event)
        setStrokes((current) => startStroke(current, point))
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return
        const point = pointOf(event)
        setStrokes((current) => extendStroke(current, point))
      }}
      onPointerUp={() => {
        drawing.current = false
      }}
      onPointerCancel={() => {
        drawing.current = false
      }}
    />
  )
}
