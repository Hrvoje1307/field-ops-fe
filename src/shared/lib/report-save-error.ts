import type { FieldValues, UseFormSetError } from 'react-hook-form'
import { toast } from 'sonner'

import { ApiError } from '@/shared/api/api-error'

import { applyServerFieldErrors } from './form-errors'

/**
 * A failed save: a 400's field errors next to the inputs they belong to (the rest as a
 * toast); anything else as a toast with `fallback`. The form keeps what was typed.
 */
export function reportSaveError<T extends FieldValues>(
  error: unknown,
  form: { setError: UseFormSetError<T>; getValues: () => T },
  fallback: string,
): void {
  if (error instanceof ApiError && error.status === 400) {
    const fieldErrors = error.fieldErrors
    if (Object.keys(fieldErrors).length > 0) {
      const unmatched = applyServerFieldErrors(form.setError, fieldErrors, form.getValues())
      if (unmatched.length > 0) toast.error(unmatched.join(' '))
      return
    }
  }
  toast.error(fallback)
}
