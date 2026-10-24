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

/** `contacts[1].phone` → `contacts.1.phone` (the API writes indexes in brackets). */
export function dottedPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1')
}

/** Every path in a form's values, nested objects and arrays included (`contacts.0.phone`). */
export function valuePaths(values: unknown, prefix = ''): string[] {
  if (typeof values !== 'object' || values === null) return []
  return Object.entries(values).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return [path, ...valuePaths(value, path)]
  })
}

/**
 * Puts a 400's field errors on the form fields whose path matches (API paths with
 * brackets converted, optionally under `prefix`). Returns the messages no field took.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string[]>,
  values: unknown,
  prefix = '',
): string[] {
  const errors: Record<string, string[]> = {}
  for (const [path, messages] of Object.entries(fieldErrors)) {
    const target = prefix ? `${prefix}.${dottedPath(path)}` : dottedPath(path)
    errors[target] = [...(errors[target] ?? []), ...messages]
  }
  return applyFieldErrors(setError, errors, valuePaths(values))
}
