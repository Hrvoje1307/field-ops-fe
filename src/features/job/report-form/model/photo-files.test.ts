import { describe, expect, it } from 'vitest'

import { mimeOf, photoProblem } from './photo-files'

const file = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('photo files', () => {
  it('takes the image types the API takes', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(mimeOf(file('a', type))).toBe(type)
    }
  })

  it('reads HEIC from the extension when the browser gives no type, and HEIF as HEIC', () => {
    expect(mimeOf(file('IMG_0001.HEIC', ''))).toBe('image/heic')
    expect(mimeOf(file('x.heif', ''))).toBe('image/heic')
    expect(mimeOf(file('a', 'image/heif'))).toBe('image/heic')
  })

  it('refuses other types', () => {
    expect(mimeOf(file('a.gif', 'image/gif'))).toBeNull()
    expect(mimeOf(file('a.pdf', 'application/pdf'))).toBeNull()
    expect(photoProblem(file('a.gif', 'image/gif'))).toBe('unsupported')
  })

  it('refuses what is over 20 MB, by the size after shrinking when given', () => {
    const big = file('a.jpg', 'image/jpeg', 25 * 1024 * 1024)
    expect(photoProblem(big)).toBe('tooLarge')
    expect(photoProblem(big, 3 * 1024 * 1024)).toBeNull()
    expect(photoProblem(file('a.jpg', 'image/jpeg', 20 * 1024 * 1024))).toBeNull()
  })
})
