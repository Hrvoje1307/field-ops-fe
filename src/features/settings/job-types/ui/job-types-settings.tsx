import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useController, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useListChecklistTemplates } from '@/entities/checklist-template'
import {
  buildJobTypeSchema,
  type JobType,
  jobTypeFormValues,
  type JobTypeFormValues,
  toJobTypeBody,
  useCreateJobType,
  useDeleteJobType,
  useListJobTypes,
  useUpdateJobType,
} from '@/entities/job-type'
import { type Skill, useListSkills } from '@/entities/skill'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { ColorDot } from '@/shared/ui/color-dot'
import { ColorField } from '@/shared/ui/color-field'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Checkbox } from '@/shared/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/** The tenant's job types: what they are called, how long they take, who and what they need. */
export function JobTypesSettings() {
  const { t } = useTranslation()
  const { formatDuration } = useTenantFormat()
  const jobTypes = useListJobTypes()
  const skills = useListSkills()
  const templates = useListChecklistTemplates()
  const [editing, setEditing] = useState<JobType | 'new' | null>(null)
  const [deleting, setDeleting] = useState<JobType | null>(null)

  const meta = (jobType: JobType) => {
    const skillNames = jobType.requiredSkillIds
      .map((id) => skills.data?.find((skill) => skill.id === id)?.name)
      .filter((name): name is string => name !== undefined)
    const checklist = templates.data?.find(
      (template) => template.id === jobType.checklistTemplateId,
    )
    return [
      formatDuration(jobType.defaultDurationMin),
      t('settings.jobTypes.meta.people', { count: jobType.requiredPeople }),
      skillNames.length > 0
        ? t('settings.jobTypes.meta.skills', { names: skillNames.join(', ') })
        : null,
      checklist ? t('settings.jobTypes.meta.checklist', { name: checklist.name }) : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <section aria-label={t('settings.jobTypes.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.jobTypes.title')}
        description={t('settings.jobTypes.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.jobTypes.add')}
          </Button>
        }
      />
      {jobTypes.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.jobTypes.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void jobTypes.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !jobTypes.data ? (
        <Skeleton className="h-40" />
      ) : jobTypes.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.jobTypes.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.jobTypes.list')}>
          {jobTypes.data.map((jobType) => (
            <ConfigListItem
              key={jobType.id}
              leading={<ColorDot color={jobType.color} className="size-4" />}
              title={
                <>
                  {jobType.name}
                  {!jobType.isActive && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      {t('settings.jobTypes.inactive')}
                    </Badge>
                  )}
                </>
              }
              meta={meta(jobType)}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${jobType.name}`}
                    onClick={() => {
                      setEditing(jobType)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${jobType.name}`}
                    onClick={() => {
                      setDeleting(jobType)
                    }}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </>
              }
            />
          ))}
        </ConfigList>
      )}
      {editing && (
        <JobTypeSheet
          jobType={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteJobTypeDialog
        jobType={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function JobTypeSheet({ jobType, onClose }: { jobType?: JobType; onClose: () => void }) {
  const { t } = useTranslation()
  const skills = useListSkills()
  const templates = useListChecklistTemplates()
  const schema = useMemo(() => buildJobTypeSchema(), [])
  const form = useForm<JobTypeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: jobTypeFormValues(jobType),
  })
  const create = useCreateJobType()
  const update = useUpdateJobType()

  const submit = form.handleSubmit(async (values) => {
    // A skill that has been deleted since is no longer asked for
    const known = new Set((skills.data ?? []).map((skill) => skill.id))
    const body = toJobTypeBody({
      ...values,
      requiredSkillIds: values.requiredSkillIds.filter((id) => known.has(id)),
    })
    try {
      if (jobType) await update.mutateAsync({ id: jobType.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.jobTypes.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('settings.jobTypes.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={jobType ? t('settings.jobTypes.editTitle') : t('settings.jobTypes.newTitle')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <TextField name="name" label={t('settings.jobTypes.name')} required autoFocus />
        <ColorField
          name="color"
          label={t('settings.jobTypes.color')}
          pickerLabel={t('settings.jobTypes.colorPicker')}
        />
        <FieldRow>
          <TextField
            name="defaultDurationMin"
            type="number"
            min={5}
            inputMode="numeric"
            label={t('settings.jobTypes.duration')}
            required
          />
          <TextField
            name="requiredPeople"
            type="number"
            min={1}
            max={10}
            inputMode="numeric"
            label={t('settings.jobTypes.people')}
            required
          />
        </FieldRow>
        <SkillChoices skills={skills.data} />
        <SelectField
          name="checklistTemplateId"
          label={t('settings.jobTypes.checklist')}
          hint={t('settings.jobTypes.checklistHint')}
          emptyLabel={t('settings.jobTypes.noChecklist')}
          options={(templates.data ?? []).map((template) => ({
            value: template.id,
            label: template.name,
          }))}
        />
        <CheckboxField name="smsEnabled" label={t('settings.jobTypes.smsEnabled')} />
        <CheckboxField name="isActive" label={t('settings.jobTypes.isActive')} />
      </FormSheet>
    </FormProvider>
  )
}

/** The tenant's skills as checkboxes; the chosen ones are the type's required skills. */
function SkillChoices({ skills }: { skills: Skill[] | undefined }) {
  const { t } = useTranslation()
  const {
    field: { value, onChange },
  } = useController<Pick<JobTypeFormValues, 'requiredSkillIds'>, 'requiredSkillIds'>({
    name: 'requiredSkillIds',
  })
  return (
    <FieldSet>
      <FieldLegend variant="label">{t('settings.jobTypes.skills')}</FieldLegend>
      {!skills ? (
        <Skeleton className="h-16" />
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.jobTypes.noSkills')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {skills.map((skill) => {
            const id = `skill-${skill.id}`
            return (
              <Field key={skill.id} orientation="horizontal">
                <Checkbox
                  id={id}
                  checked={value.includes(skill.id)}
                  onCheckedChange={(checked) => {
                    onChange(
                      checked === true
                        ? [...value, skill.id]
                        : value.filter((chosen) => chosen !== skill.id),
                    )
                  }}
                />
                <FieldLabel htmlFor={id} className="font-normal">
                  {skill.name}
                </FieldLabel>
              </Field>
            )
          })}
        </div>
      )}
    </FieldSet>
  )
}

function DeleteJobTypeDialog({
  jobType,
  onClose,
}: {
  jobType: JobType | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteJobType()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<JobType | null>(null)
  if (jobType && jobType !== last) {
    setLast(jobType)
    setError(null)
  }
  const name = (jobType ?? last)?.name ?? ''
  return (
    <ConfirmDialog
      open={jobType !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.jobTypes.delete.title')}
      description={t('settings.jobTypes.delete.description', { name })}
      confirmLabel={t('settings.jobTypes.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!jobType) return
        remove.mutate(jobType.id, {
          onSuccess: () => {
            toast.success(t('settings.jobTypes.delete.done', { name }))
            onClose()
          },
          onError: (failure) => {
            setError(
              isConflict(failure)
                ? t('settings.jobTypes.delete.inUse')
                : t('settings.jobTypes.delete.failed'),
            )
          },
        })
      }}
    />
  )
}
