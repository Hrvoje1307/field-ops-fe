import { normalizePhone, type CountryCode } from '@/shared/lib/phone'

/** Case- and diacritic-insensitive form for search (đ has no decomposition, so it's mapped by hand). */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
}

/** Every whitespace-separated term of `query` appears somewhere in `fields`. */
export function matchesQuery(
  query: string | undefined,
  fields: (string | null | undefined)[],
): boolean {
  const terms = normalizeText(query ?? '')
    .split(/\s+/)
    .filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalizeText(fields.filter(Boolean).join(' '))
  return terms.every((term) => haystack.includes(term))
}

/** Searchable variants of an E.164 phone: as stored, digits only, and national (0…). */
export function phoneSearchText(e164: string | null, country: CountryCode | undefined): string[] {
  if (!e164) return []
  const digits = e164.replace(/\D/g, '')
  const national = country === 'HR' && digits.startsWith('385') ? `0${digits.slice(3)}` : null
  const variants = [e164, digits]
  if (national) variants.push(national)
  // Callers type numbers with spaces ("091 210"); also match the normalised query
  return variants
}

export { normalizePhone }
