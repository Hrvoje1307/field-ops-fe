import type { TFunction } from 'i18next'

import { ApiError } from '@/shared/api/api-error'

/** Form-level message for a failed sign-in (field errors are shown next to the fields instead). */
export function signInErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return t('auth.signIn.errors.invalidCredentials')
    if (error.status === 429) {
      // Retry-After is only readable when the API exposes it via CORS
      return error.retryAfter === null
        ? t('auth.signIn.errors.tooManyAttemptsGeneric')
        : t('auth.signIn.errors.tooManyAttempts', {
            minutes: Math.max(1, Math.ceil(error.retryAfter / 60)),
          })
    }
    return t('auth.signIn.errors.generic')
  }
  // fetch rejects with a TypeError when the network or CORS fails
  return error instanceof TypeError
    ? t('auth.signIn.errors.network')
    : t('auth.signIn.errors.generic')
}
