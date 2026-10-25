import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field'
import { Textarea } from '@/shared/ui/textarea'

import { Section } from './section'

export function WorkDoneSection({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <Section title={t('report.workDone.title')}>
      <Field>
        <FieldLabel htmlFor={id} className="sr-only">
          {t('report.workDone.label')}
        </FieldLabel>
        <Textarea
          id={id}
          rows={6}
          className="text-base"
          value={value}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
        <FieldDescription id={`${id}-hint`}>{t('report.workDone.hint')}</FieldDescription>
      </Field>
    </Section>
  )
}
