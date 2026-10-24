import { type ReactNode, useId, useState } from 'react'
import { get, useFormState } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  type CustomFieldDefinition,
  CustomFieldInputs,
  customFieldPaths,
} from '@/entities/custom-field'

/** One titled part of the form. */
export function FormSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl border p-4 md:p-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * The tenant's custom fields for a record: required ones in view, optional ones under
 * "Dodatni podaci" (opened by itself when one of them has an error).
 */
export function CustomFieldsBlock({
  definitions,
  name,
}: {
  definitions: readonly CustomFieldDefinition[]
  name: string
}) {
  const required = definitions.filter((definition) => definition.required)
  const optional = definitions.filter((definition) => !definition.required)
  return (
    <>
      {required.length > 0 && <CustomFieldInputs definitions={required} name={name} />}
      {optional.length > 0 && (
        <MoreFields paths={customFieldPaths(optional, name)}>
          <CustomFieldInputs definitions={optional} name={name} />
        </MoreFields>
      )}
    </>
  )
}

function MoreFields({ paths, children }: { paths: string[]; children: ReactNode }) {
  const { t } = useTranslation()
  const { errors } = useFormState({ name: paths })
  const hasError = paths.some((path) => get(errors, path) !== undefined)
  const [open, setOpen] = useState(false)
  return (
    <details
      open={open || hasError}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
      className="group rounded-lg border px-3 py-2"
    >
      <summary className="cursor-pointer text-sm font-medium select-none">
        {t('common.moreFields')}
      </summary>
      <div className="pt-4 pb-2">{children}</div>
    </details>
  )
}
