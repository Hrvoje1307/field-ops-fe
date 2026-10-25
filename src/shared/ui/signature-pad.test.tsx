import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SignaturePad, type SignaturePadHandle } from './signature-pad'

/** jsdom has no canvas: a context that accepts every call, and a toBlob that answers. */
beforeEach(() => {
  const context = new Proxy({}, { get: () => vi.fn(), set: () => true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob(['png'], { type: 'image/png' }))
  })
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
})

function setup() {
  const ref = createRef<SignaturePadHandle>()
  const onInkChange = vi.fn()
  render(<SignaturePad ref={ref} onInkChange={onInkChange} label="Potpis" />)
  const canvas = screen.getByRole('img', { name: 'Potpis' })
  return { ref, onInkChange, canvas }
}

const draw = (canvas: HTMLElement) => {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 30 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
}

describe('SignaturePad', () => {
  it('starts empty, has ink after drawing, and says so', () => {
    const { onInkChange, canvas } = setup()
    expect(onInkChange).toHaveBeenLastCalledWith(false)
    draw(canvas)
    expect(onInkChange).toHaveBeenLastCalledWith(true)
  })

  it('moving without pressing draws nothing', () => {
    const { onInkChange, canvas } = setup()
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 30 })
    expect(onInkChange).toHaveBeenLastCalledWith(false)
  })

  it('a touch without moving is a dot', () => {
    const { onInkChange, canvas } = setup()
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    expect(onInkChange).toHaveBeenLastCalledWith(true)
  })

  it('clear removes the ink', () => {
    const { ref, onInkChange, canvas } = setup()
    draw(canvas)
    act(() => {
      ref.current?.clear()
    })
    expect(onInkChange).toHaveBeenLastCalledWith(false)
  })

  it('gives a PNG when something is drawn, nothing when it is empty', async () => {
    const { ref, canvas } = setup()
    expect(await ref.current?.toBlob()).toBeNull()
    draw(canvas)
    const blob = await ref.current?.toBlob()
    expect(blob?.type).toBe('image/png')
  })
})
