import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

import type { DraftErrors, ReportDraft } from '../model/report-draft'
import { Section } from './section'

export function TimesSection({
  draft,
  errors,
  onChange,
}: {
  draft: ReportDraft
  errors: DraftErrors
  onChange: (changes: Partial<ReportDraft>) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const message = (error: 'invalid' | 'order' | undefined) =>
    error === 'order'
      ? t('report.times.order')
      : error === 'invalid'
        ? t('report.times.invalid')
        : undefined
  return (
    <Section title={t('report.times.title')}>
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={errors.started ? true : undefined}>
          <FieldLabel htmlFor={`${id}-start`}>{t('report.times.started')}</FieldLabel>
          <Input
            id={`${id}-start`}
            type="time"
            className="h-12 text-base"
            value={draft.started}
            aria-invalid={errors.started ? true : undefined}
            onChange={(event) => {
              onChange({ started: event.target.value })
            }}
          />
          <FieldError>{message(errors.started)}</FieldError>
        </Field>
        <Field data-invalid={errors.finished ? true : undefined}>
          <FieldLabel htmlFor={`${id}-end`}>{t('report.times.finished')}</FieldLabel>
          <Input
            id={`${id}-end`}
            type="time"
            className="h-12 text-base"
            value={draft.finished}
            aria-invalid={errors.finished ? true : undefined}
            onChange={(event) => {
              onChange({ finished: event.target.value })
            }}
          />
          <FieldError>{message(errors.finished)}</FieldError>
        </Field>
      </div>
      <Field data-invalid={errors.labour ? true : undefined}>
        <FieldLabel htmlFor={`${id}-labour`}>{t('report.times.labour')}</FieldLabel>
        <Input
          id={`${id}-labour`}
          inputMode="numeric"
          className="h-12 text-base"
          value={draft.labour}
          aria-invalid={errors.labour ? true : undefined}
          onChange={(event) => {
            onChange({ labour: event.target.value.trim() })
          }}
        />
        <FieldError>{errors.labour ? t('report.times.labourInvalid') : undefined}</FieldError>
      </Field>
    </Section>
  )
}
