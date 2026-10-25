// The GSM 03.38 basic character set and its extension table (an extension costs two)
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXTENDED = '^{}\\[~]|€\f'

/**
 * Whether an SMS can be sent in the 7-bit alphabet. Croatian č, ć, š, ž and đ cannot: one
 * of them makes the whole message UCS-2, which fits 70 characters instead of 160.
 */
export function fitsGsm7(text: string): boolean {
  return Array.from(text).every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c))
}

/** The characters of `text` that force UCS-2, each once, in the order they appear. */
export function unicodeOnlyCharacters(text: string): string[] {
  const found: string[] = []
  for (const c of text) {
    if (!GSM_BASIC.includes(c) && !GSM_EXTENDED.includes(c) && !found.includes(c) && c !== '\n') {
      found.push(c)
    }
  }
  return found
}
