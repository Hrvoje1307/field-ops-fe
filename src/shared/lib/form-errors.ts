import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'

/**
 * Puts 400 field errors (API path → messages) on the form fields with the same path.
 * Form field names mirror the request body, so `customFields.zones` or
 * `firstLocation.customFields.zones` land on the input they belong to; the first
 * one gets focus. Returns the messages no field took, to show as a toast.
 */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[]>,
  knownPaths: readonly string[],
): string[] {
  const known = new Set(knownPaths)
  const unmatched: string[] = []
  let focused = false
  for (const [path, messages] of Object.entries(fieldErrors)) {
    if (messages.length === 0) continue
    if (!known.has(path)) {
      unmatched.push(...messages)
      continue
    }
    // Paths are checked against the form's own field names above
    setError(
      path as FieldPath<T>,
      { type: 'server', message: messages.join(' ') },
      { shouldFocus: !focused },
    )
    focused = true
  }
  return unmatched
}
