import { describe, expect, it } from 'vitest'

import { fitWithin, shrinkPhoto } from './image'

describe('fitWithin', () => {
  it('keeps the proportions and the longest side at the limit', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('never enlarges', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 })
  })
})

describe('shrinkPhoto', () => {
  it('hands the file back when the browser cannot decode it (as in this test environment)', async () => {
    const file = new Blob(['not really a photo'], { type: 'image/heic' })
    expect(await shrinkPhoto(file)).toBe(file)
  })
})
