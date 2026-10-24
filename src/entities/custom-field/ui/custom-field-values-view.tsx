import { cn } from 'cn'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { CustomFieldDefinition, CustomFieldValues } from '@/shared/api/generated/model'
import { isPlainDate } from '@/shared/lib/datetime'
import { type TenantFormat, useTenantFormat } from '@/shared/lib/tenant-format'
import { SensitiveValue } from '@/shared/ui/sensitive-value'

import { prepareDefinitions } from '../lib/definitions'

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)

/** A stored value for display; options show their label, a removed option its stored value. */
function displayValue(
  definition: CustomFieldDefinition,
  value: unknown,
  format: Pick<TenantFormat, 'formatDate' | 'formatNumber'>,
  yesNo: (value: boolean) => string,
): string {
  const optionLabel = (stored: unknown) =>
    definition.options?.find((option) => option.value === stored)?.label ?? String(stored)
  switch (definition.type) {
    case 'number':
      return typeof value === 'number' ? format.formatNumber(value) : String(value)
    case 'date':
      return isPlainDate(value) ? format.formatDate(value) : String(value)
    case 'select':
      return optionLabel(value)
    case 'multiselect':
      return Array.isArray(value) ? value.map(optionLabel).join(', ') : optionLabel(value)
    case 'checkbox':
      return typeof value === 'boolean' ? yesNo(value) : String(value)
    case 'text':
    case 'textarea':
      return String(value)
  }
}

/**
 * Read-only custom fields: label and value in the definitions' order. Sensitive values
 * are masked until revealed. The API leaves out sensitive values the viewer may not
 * see, so they show as empty (docs/backend-questions.md #22).
 */
export function CustomFieldValuesView({
  definitions,
  values,
  className,
}: {
  definitions: readonly CustomFieldDefinition[]
  values: CustomFieldValues | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const format = useTenantFormat()
  const ordered = useMemo(() => prepareDefinitions(definitions), [definitions])
  if (ordered.length === 0) return null

  return (
    <dl
      className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(10rem,max-content)_1fr]', className)}
    >
      {ordered.map((definition) => {
        const value = values?.[definition.key]
        let content: ReactNode
        if (isBlank(value)) {
          content = (
            <span className="text-muted-foreground">
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t('common.notSet')}</span>
            </span>
          )
        } else {
          const text = displayValue(definition, value, format, (yes) =>
            yes ? t('common.yes') : t('common.no'),
          )
          const shown =
            definition.type === 'textarea' ? (
              <span className="whitespace-pre-line">{text}</span>
            ) : (
              <span>{text}</span>
            )
          content = definition.isSensitive ? (
            <SensitiveValue label={definition.label}>{shown}</SensitiveValue>
          ) : (
            shown
          )
        }
        return (
          <div key={definition.id} className="contents">
            <dt className="text-sm text-muted-foreground">{definition.label}</dt>
            <dd className="text-sm">{content}</dd>
          </div>
        )
      })}
    </dl>
  )
}
