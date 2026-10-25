import { type ReactNode, useId } from 'react'
import { useController } from 'react-hook-form'

import { Checkbox } from './checkbox'
import { Field, FieldDescription, FieldError, FieldLabel } from './field'

/** A labelled checkbox bound to a boolean form field, with its hint and error. */
export function CheckboxField({
  name,
  label,
  hint,
  disabled,
  className,
}: {
  /** Form path, inside a react-hook-form `FormProvider`. */
  name: string
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  const {
    field: { ref, name: fieldName, value, onChange, onBlur },
    fieldState,
  } = useController<Record<string, boolean>>({ name })
  const error = fieldState.error?.message
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          ref={ref}
          name={fieldName}
          disabled={disabled}
          checked={value}
          onBlur={onBlur}
          onCheckedChange={(checked) => {
            onChange(checked === true)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
      </Field>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
