import { useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import type { JobType } from '@/entities/job-type'
import { Priority } from '@/shared/api/generated/model'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import { FieldGroup } from '@/shared/ui/field'
import { SelectField } from '@/shared/ui/select-field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

import { OFFICE_SOURCES, type QuickJobDefinitions, type QuickJobFormValues } from '../model/schema'
import { CustomFieldsBlock } from './form-parts'

const PRIORITIES = [Priority.low, Priority.normal, Priority.high, Priority.urgent]

/** The job itself; types, durations and fields come from the tenant's configuration. */
export function JobFields({
  definitions,
  jobTypes,
  basic = false,
}: {
  /** Only what a job made from a deal carries: no source, duration, crew size or internal note. */
  basic?: boolean
  definitions: QuickJobDefinitions
  /** Active job types, offered for new jobs. */
  jobTypes: readonly JobType[]
}) {
  const { t } = useTranslation()
  const { formatDuration } = useTenantFormat()
  const jobTypeId = useWatch<QuickJobFormValues, 'job.jobTypeId'>({ name: 'job.jobTypeId' })
  const jobType = jobTypes.find((candidate) => candidate.id === jobTypeId)

  return (
    <FieldGroup>
      <FieldRow>
        <SelectField
          name="job.jobTypeId"
          label={t('job.create.jobType')}
          emptyLabel={t('job.create.chooseJobType')}
          required
          options={[...jobTypes]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((type) => ({ value: type.id, label: type.name }))}
        />
        <TextField name="job.title" label={t('job.create.jobTitle')} required autoComplete="off" />
      </FieldRow>
      <TextField name="job.description" label={t('job.create.description')} rows={3} />
      <FieldRow>
        <ChoiceGroup
          name="job.priority"
          legend={t('job.create.priority')}
          choices={PRIORITIES.map((value) => ({ value, label: t(`job.priority.${value}`) }))}
        />
        {!basic && (
          <ChoiceGroup
            name="job.source"
            legend={t('job.create.source')}
            choices={OFFICE_SOURCES.map((value) => ({ value, label: t(`job.source.${value}`) }))}
          />
        )}
      </FieldRow>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="job.preferredDate" label={t('job.create.preferredDate')} type="date" />
        <TextField name="job.windowStart" label={t('job.create.windowStart')} type="time" />
        <TextField name="job.windowEnd" label={t('job.create.windowEnd')} type="time" />
      </div>
      {!basic && (
        <FieldRow>
          <TextField
            name="job.durationMin"
            label={t('job.create.duration')}
            inputMode="numeric"
            autoComplete="off"
            placeholder={jobType ? String(jobType.defaultDurationMin) : undefined}
            hint={
              jobType
                ? t('job.create.defaultValue', {
                    value: formatDuration(jobType.defaultDurationMin),
                  })
                : undefined
            }
          />
          <TextField
            name="job.requiredPeople"
            label={t('job.create.people')}
            inputMode="numeric"
            autoComplete="off"
            placeholder={jobType ? String(jobType.requiredPeople) : undefined}
            hint={
              jobType ? t('job.create.defaultValue', { value: jobType.requiredPeople }) : undefined
            }
          />
        </FieldRow>
      )}
      {!basic && (
        <TextField
          name="job.internalNote"
          label={t('job.create.internalNote')}
          hint={t('job.create.internalNoteHint')}
          rows={2}
        />
      )}
      <CustomFieldsBlock definitions={definitions.job} name="job.customFields" />
    </FieldGroup>
  )
}
