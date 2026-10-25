import { type ReactNode, useId } from 'react'
import { useController } from 'react-hook-form'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'
import { Input } from './input'

const COLOR = /^#[0-9a-fA-F]{6}$/

/** A colour as `#rrggbb`: a picker and the code to type, bound to one form field. */
export function ColorField({
  name,
  label,
  pickerLabel,
  hint,
  className,
}: {
  /** Form path, inside a react-hook-form `FormProvider`. */
  name: string
  label: ReactNode
  /** Names the colour picker for screen readers. */
  pickerLabel: string
  hint?: ReactNode
  className?: string
}) {
  const id = useId()
  const {
    field: { ref, name: fieldName, value, onChange, onBlur },
    fieldState,
  } = useController<Record<string, string>>({ name })
  const error = fieldState.error?.message
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={pickerLabel}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5"
          value={COLOR.test(value) ? value.toLowerCase() : '#000000'}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
        <Input
          id={id}
          ref={ref}
          name={fieldName}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          spellCheck={false}
          autoComplete="off"
          placeholder="#2563eb"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="w-32 font-mono"
        />
      </div>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}
