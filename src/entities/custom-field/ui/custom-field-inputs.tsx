import { type ReactNode, useId, useMemo, useState } from 'react'
import { useController } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { CustomFieldDefinition } from '@/shared/api/generated/model'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { SensitiveValue } from '@/shared/ui/sensitive-value'
import { Textarea } from '@/shared/ui/textarea'

import { prepareDefinitions, removedOptions } from '../lib/definitions'
import {
  type CustomFieldFormValue,
  isSensitiveFormValue,
  type PlainFormValue,
} from '../model/types'

interface CustomFieldInputsProps {
  definitions: readonly CustomFieldDefinition[]
  /**
   * Form path of the values object. It mirrors the request body (`customFields`,
   * `firstLocation.customFields`), so 400 errors map onto the inputs by path.
   */
  name?: string
  disabled?: boolean
}

/**
 * Inputs for the tenant's custom fields, inside a react-hook-form `FormProvider`.
 * Labels, options, order and required come from the definitions.
 */
export function CustomFieldInputs({
  definitions,
  name = 'customFields',
  disabled,
}: CustomFieldInputsProps) {
  const ordered = useMemo(() => prepareDefinitions(definitions), [definitions])
  return (
    <FieldGroup>
      {ordered.map((definition) => (
        <CustomFieldInput
          key={definition.id}
          definition={definition}
          name={`${name}.${definition.key}`}
          disabled={disabled}
        />
      ))}
    </FieldGroup>
  )
}

function RequiredMark({ required }: { required: boolean }) {
  if (!required) return null
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function emptyValue(definition: CustomFieldDefinition): PlainFormValue {
  if (definition.type === 'multiselect') return []
  if (definition.type === 'checkbox') return false
  return ''
}

function CustomFieldInput({
  definition,
  name,
  disabled,
}: {
  definition: CustomFieldDefinition
  name: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const { field, fieldState } = useController({ name })
  // Focus the input that replaces the mask once the user reveals it
  const [focusOnShow, setFocusOnShow] = useState(false)

  const formValue = field.value as CustomFieldFormValue | undefined
  const sensitive = isSensitiveFormValue(formValue) ? formValue : null
  const value: PlainFormValue = isSensitiveFormValue(formValue)
    ? formValue.value
    : (formValue ?? emptyValue(definition))
  const setValue = (next: PlainFormValue) => {
    field.onChange(sensitive ? { ...sensitive, value: next } : next)
  }

  const error = fieldState.error?.message
  const removed = removedOptions(definition, value)
  const errorId = `${id}-error`
  const warningId = `${id}-warning`
  const describedBy = error ? errorId : removed.length > 0 ? warningId : undefined
  const invalid = error ? true : undefined

  const feedback: ReactNode = error ? (
    <FieldError id={errorId}>{error}</FieldError>
  ) : removed.length > 0 ? (
    <p id={warningId} className="text-sm text-amber-800">
      {removed.map((option) => (
        <span key={option} className="block">
          {t('customField.errors.removedOption', { value: option })}
        </span>
      ))}
    </p>
  ) : null

  if (sensitive?.masked) {
    return (
      <Field data-invalid={invalid}>
        <FieldTitle>
          {definition.label}
          <RequiredMark required={definition.required} />
        </FieldTitle>
        <SensitiveValue
          label={definition.label}
          hideable={false}
          onReveal={() => {
            setFocusOnShow(true)
            field.onChange({ ...sensitive, masked: false })
          }}
        >
          {null}
        </SensitiveValue>
        {feedback}
      </Field>
    )
  }

  const common = {
    id,
    name: field.name,
    ref: field.ref,
    onBlur: field.onBlur,
    disabled,
    autoFocus: focusOnShow,
    'aria-invalid': invalid,
    'aria-required': definition.required || undefined,
    'aria-describedby': describedBy,
  }
  const label = (
    <FieldLabel htmlFor={id}>
      {definition.label}
      <RequiredMark required={definition.required} />
    </FieldLabel>
  )
  const text = typeof value === 'string' ? value : ''

  switch (definition.type) {
    case 'text':
    case 'number':
    case 'date':
      return (
        <Field data-invalid={invalid}>
          {label}
          <Input
            {...common}
            type={definition.type === 'date' ? 'date' : 'text'}
            inputMode={definition.type === 'number' ? 'decimal' : undefined}
            autoComplete="off"
            value={text}
            onChange={(event) => {
              setValue(event.target.value)
            }}
          />
          {feedback}
        </Field>
      )

    case 'textarea':
      return (
        <Field data-invalid={invalid}>
          {label}
          <Textarea
            {...common}
            rows={3}
            value={text}
            onChange={(event) => {
              setValue(event.target.value)
            }}
          />
          {feedback}
        </Field>
      )

    case 'select':
      return (
        <Field data-invalid={invalid}>
          {label}
          <NativeSelect
            {...common}
            className="w-full"
            value={text}
            onChange={(event) => {
              setValue(event.target.value)
            }}
          >
            <NativeSelectOption value="">
              {definition.required ? t('customField.choose') : t('customField.noSelection')}
            </NativeSelectOption>
            {(definition.options ?? []).map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
            {/* The stored value stays selected until the user picks a current option */}
            {removed.map((option) => (
              <NativeSelectOption key={`removed:${option}`} value={option}>
                {option}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {feedback}
        </Field>
      )

    case 'multiselect': {
      const selected = Array.isArray(value) ? value : []
      const choices = [
        ...(definition.options ?? []),
        ...removed.map((option) => ({ value: option, label: option })),
      ]
      return (
        <FieldSet data-invalid={invalid} aria-describedby={describedBy}>
          <FieldLegend variant="label">
            {definition.label}
            <RequiredMark required={definition.required} />
          </FieldLegend>
          <FieldGroup className="gap-2">
            {choices.map((option, index) => {
              const optionId = `${id}-${String(index)}`
              return (
                <Field key={option.value} orientation="horizontal">
                  <Checkbox
                    id={optionId}
                    ref={index === 0 ? field.ref : undefined}
                    autoFocus={index === 0 && focusOnShow}
                    disabled={disabled}
                    aria-invalid={invalid}
                    checked={selected.includes(option.value)}
                    onBlur={field.onBlur}
                    onCheckedChange={(checked) => {
                      setValue(
                        checked === true
                          ? [...selected, option.value]
                          : selected.filter((item) => item !== option.value),
                      )
                    }}
                  />
                  <FieldLabel htmlFor={optionId} className="font-normal">
                    {option.label}
                  </FieldLabel>
                </Field>
              )
            })}
          </FieldGroup>
          {feedback}
        </FieldSet>
      )
    }

    case 'checkbox':
      return (
        <Field data-invalid={invalid}>
          <Field orientation="horizontal">
            <Checkbox
              {...common}
              checked={value === true}
              onCheckedChange={(checked) => {
                setValue(checked === true)
              }}
            />
            <FieldLabel htmlFor={id} className="font-normal">
              {definition.label}
              <RequiredMark required={definition.required} />
            </FieldLabel>
          </Field>
          {feedback}
        </Field>
      )
  }
}
