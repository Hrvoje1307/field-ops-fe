/** UUID v7 layout: 48-bit millisecond timestamp, then random bits (time-sortable like the backend's ids). */
function formatUuidV7(timestampMs: number, randomHex: string): string {
  const time = Math.floor(timestampMs).toString(16).padStart(12, '0').slice(-12)
  const variant = (8 + (parseInt(randomHex.charAt(3), 16) & 3)).toString(16)
  return `${time.slice(0, 8)}-${time.slice(8, 12)}-7${randomHex.slice(0, 3)}-${variant}${randomHex.slice(4, 7)}-${randomHex.slice(7, 19)}`
}

function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length)
}

/** Fresh id for rows created at runtime. */
export function newId(): string {
  return formatUuidV7(Date.now(), randomHex(19))
}

/** Opaque random token (refresh tokens). */
export function newToken(prefix: string): string {
  return `${prefix}_${randomHex(48)}`
}

/** Deterministic ids for the seed: the same day always produces the same ids. */
export function createSeedIdFactory(seed: string, baseMs: number): () => string {
  let state = 0
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0
  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0).toString(16).padStart(8, '0')
  }
  let counter = 0
  return () => formatUuidV7(baseMs + counter++, `${next()}${next()}${next()}`)
}
