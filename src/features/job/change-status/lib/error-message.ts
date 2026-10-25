import type { TFunction } from 'i18next'

import { ApiError } from '@/shared/api/api-error'

/** Toast text for a failed change other than 409 (which the hook handles by refetching). */
export function changeStatusErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError && error.status === 403) return t('job.changeStatus.forbidden')
  return t('job.changeStatus.failed')
}
