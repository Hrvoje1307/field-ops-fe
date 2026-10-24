const BLACK = '#000000'
const WHITE = '#ffffff'

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [r = 0, g = 0, b = 0] = channels
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Black or white, whichever contrasts more with the `#rrggbb` background. */
export function readableTextColor(background: string): typeof BLACK | typeof WHITE {
  if (!/^#[0-9a-f]{6}$/i.test(background)) return BLACK
  const l = luminance(background)
  // Contrast ratios against black and white: (l + 0.05) / 0.05 vs 1.05 / (l + 0.05)
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? BLACK : WHITE
}
