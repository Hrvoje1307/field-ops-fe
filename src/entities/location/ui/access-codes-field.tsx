import { useId, useState } from 'react'
import { useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/shared/ui/field'
import { SensitiveValue } from '@/shared/ui/sensitive-value'
import { Textarea } from '@/shared/ui/textarea'

import type { AccessCodesFormValue } from '../lib/access-codes'

/**
 * Access codes in an edit form: masked until revealed (then kept as stored), editable
 * once revealed; emptied removes them.
 */
export function AccessCodesField({ name }: { name: string }) {
  const { t } = useTranslation()
  const id = useId()
  const {
    field: { value, onChange, onBlur },
    fieldState,
  } = useController<Record<string, AccessCodesFormValue>>({ name })
  const [focus, setFocus] = useState(false)
  const label = t('location.accessCodes')
  const error = fieldState.error?.message

  if (value.masked) {
    return (
      <Field>
        <FieldTitle>{label}</FieldTitle>
        <SensitiveValue
          label={label}
          hideable={false}
          onReveal={() => {
            setFocus(true)
            onChange({ ...value, masked: false })
          }}
        >
          {null}
        </SensitiveValue>
      </Field>
    )
  }
  const hint = value.hadValue ? t('location.accessCodesClearHint') : t('location.accessCodesHint')
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Textarea
        id={id}
        rows={2}
        autoFocus={focus}
        value={value.value}
        onChange={(event) => {
          onChange({ ...value, value: event.target.value })
        }}
        onBlur={onBlur}
        aria-describedby={`${id}-hint`}
      />
      <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
