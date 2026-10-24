import { cn } from 'cn'
import type { ReactNode } from 'react'
import { useController } from 'react-hook-form'

import { FieldError, FieldLegend, FieldSet } from './field'

export interface Choice {
  value: string
  label: ReactNode
}

/** One choice out of a few, as a row of radio buttons bound to a form field. */
export function ChoiceGroup({
  name,
  legend,
  choices,
  className,
}: {
  /** Form path, inside a react-hook-form `FormProvider`. */
  name: string
  legend: ReactNode
  choices: readonly Choice[]
  className?: string
}) {
  const { field, fieldState } = useController({ name })
  return (
    <FieldSet className={className}>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
              'has-checked:border-primary has-checked:bg-primary/5 has-checked:font-medium',
              'has-focus-visible:ring-2 has-focus-visible:ring-ring',
            )}
          >
            <input
              type="radio"
              className="accent-primary"
              name={field.name}
              value={choice.value}
              checked={field.value === choice.value}
              onChange={() => {
                field.onChange(choice.value)
              }}
              onBlur={field.onBlur}
            />
            {choice.label}
          </label>
        ))}
      </div>
      {fieldState.error?.message && <FieldError>{fieldState.error.message}</FieldError>}
    </FieldSet>
  )
}
