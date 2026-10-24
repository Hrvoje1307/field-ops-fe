import { cn } from 'cn'
import { type ComponentProps, type ReactNode, useId } from 'react'
import { useController } from 'react-hook-form'

import { Field, FieldDescription, FieldError, FieldLabel } from './field'
import { Input } from './input'
import { Textarea } from './textarea'

type InputProps = Pick<
  ComponentProps<'input'>,
  'type' | 'inputMode' | 'autoComplete' | 'placeholder' | 'autoFocus' | 'min' | 'max' | 'step'
>

interface TextFieldProps extends InputProps {
  /** Form path, inside a react-hook-form `FormProvider`. */
  name: string
  label: ReactNode
  required?: boolean
  hint?: ReactNode
  /** A textarea with this many rows instead of a single-line input. */
  rows?: number
  disabled?: boolean
  className?: string
}

/** A labelled text input bound to a form field, with its hint and error. */
export function TextField({
  name,
  label,
  required = false,
  hint,
  rows,
  disabled,
  className,
  ...inputProps
}: TextFieldProps) {
  const id = useId()
  const { field, fieldState } = useController({ name })
  const error = fieldState.error?.message
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') ||
    undefined
  const controlProps = {
    id,
    name: field.name,
    ref: field.ref,
    value: (field.value as string | undefined) ?? '',
    onChange: field.onChange,
    onBlur: field.onBlur,
    disabled,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
    'aria-describedby': describedBy,
  }

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
      {rows ? (
        <Textarea rows={rows} {...controlProps} />
      ) : (
        <Input {...inputProps} {...controlProps} />
      )}
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </Field>
  )
}

/** Puts fields side by side from the small breakpoint up. */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
}
