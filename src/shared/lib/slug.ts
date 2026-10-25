const LETTERS: Record<string, string> = { đ: 'dj', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe' }

/**
 * A text as a lower-case word of letters, digits and underscores (`Broj zona` →
 * `broj_zona`): diacritics are dropped (č → c), anything else becomes one underscore.
 * Never starts with a digit and is at most `max` characters; empty when nothing is left.
 */
export function toKey(text: string, max = 63): string {
  const ascii = text
    .toLowerCase()
    .replace(/[đłßæœ]/g, (letter) => LETTERS[letter] ?? letter)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  const key = ascii
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max)
    .replace(/_+$/, '')
  return /^\d/.test(key) ? `f_${key}`.slice(0, max) : key
}

/** `base`, or `base_2`, `base_3`… — the first not in `taken`. */
export function uniqueKey(base: string, taken: ReadonlySet<string>, max = 63): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `_${String(n)}`
    const candidate = `${base.slice(0, max - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}
