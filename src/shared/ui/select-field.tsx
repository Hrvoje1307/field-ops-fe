import { type ReactNode, useId } from 'react'
import { useController } from 'react-hook-form'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'
import { NativeSelect, NativeSelectOption } from './native-select'

export interface SelectOption {
  value: string
  label: string
}

/** A labelled native select bound to a form field; the empty option comes first. */
export function SelectField({
  name,
  label,
  options,
  emptyLabel,
  required = false,
  disabled,
  hint,
  className,
}: {
  /** Form path, inside a react-hook-form `FormProvider`. */
  name: string
  label: ReactNode
  options: readonly SelectOption[]
  /** Text of the empty choice (value ""). */
  emptyLabel: string
  required?: boolean
  disabled?: boolean
  hint?: ReactNode
  className?: string
}) {
  const id = useId()
  const {
    field: { ref, name: fieldName, value, onChange, onBlur },
    fieldState,
  } = useController<Record<string, string | undefined>>({ name })
  const error = fieldState.error?.message
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined

  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </FieldLabel>
      <NativeSelect
        id={id}
        ref={ref}
        name={fieldName}
        className="w-full"
        value={value ?? ''}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
        aria-required={required || undefined}
        aria-describedby={describedBy}
      >
        {/* A required field that has a value has no empty choice to go back to */}
        {!(required && value) && <NativeSelectOption value="">{emptyLabel}</NativeSelectOption>}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
