import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { CustomFieldValues } from '@/shared/api/generated/model'
import { Skeleton } from '@/shared/ui/skeleton'

import { useCustomFieldDefinitions } from '../model/queries'
import type { CustomFieldScope } from '../model/types'
import { CustomFieldValuesView } from './custom-field-values-view'

/**
 * Read-only custom fields of one record, with the tenant's definitions for `scope`
 * loaded here. With a `title` it is a section of its own. Renders nothing (title
 * included) when the tenant has no fields for the scope.
 */
export function CustomFieldValuesFor({
  scope,
  values,
  title,
  className,
}: {
  scope: CustomFieldScope
  values: CustomFieldValues | undefined
  title?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const definitions = useCustomFieldDefinitions(scope)
  const Wrapper = title ? 'section' : 'div'
  const heading = title ? (
    <h2 id={titleId} className="font-semibold">
      {title}
    </h2>
  ) : null

  if (definitions.isPending) {
    return (
      <div aria-busy="true" className={className}>
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-12" />
      </div>
    )
  }
  if (!definitions.isError && definitions.data.length === 0) return null
  return (
    <Wrapper aria-labelledby={title ? titleId : undefined} className={className}>
      {heading}
      {definitions.isError ? (
        <p className="text-sm text-muted-foreground">{t('customField.loadFailed')}</p>
      ) : (
        <CustomFieldValuesView definitions={definitions.data} values={values} />
      )}
    </Wrapper>
  )
}
