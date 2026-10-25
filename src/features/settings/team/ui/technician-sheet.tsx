import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { FormProvider, useController, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useListDepots } from '@/entities/depot'
import type { Member } from '@/entities/member'
import { useListSkills } from '@/entities/skill'
import {
  buildTechnicianSchema,
  type Technician,
  technicianFormValues,
  type TechnicianFormValues,
  toTechnicianBody,
  toTechnicianCreateBody,
  useCreateTechnician,
  useUpdateTechnician,
} from '@/entities/technician'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { ISO_WEEKDAYS, weekdayName } from '@/shared/lib/weekdays'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { ColorField } from '@/shared/ui/color-field'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/shared/ui/field'
import { FormSheet } from '@/shared/ui/form-sheet'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/**
 * A technician's working data: colour, hours, days, depot, skills and whether they are
 * offered in the schedule. Without a `technician` it gives the member theirs.
 */
export function TechnicianSheet({
  member,
  technician,
  onClose,
}: {
  member: Member
  technician?: Technician
  onClose: () => void
}) {
  const { t } = useTranslation()
  const depots = useListDepots()
  const skills = useListSkills()
  const schema = useMemo(() => buildTechnicianSchema(), [])
  const form = useForm<TechnicianFormValues>({
    resolver: zodResolver(schema),
    defaultValues: technicianFormValues(technician),
  })
  const create = useCreateTechnician()
  const update = useUpdateTechnician()

  const submit = form.handleSubmit(async (values) => {
    // A skill or depot deleted since is not sent
    const knownSkills = new Set((skills.data ?? []).map((skill) => skill.id))
    const cleaned: TechnicianFormValues = {
      ...values,
      skillIds: skills.data ? values.skillIds.filter((id) => knownSkills.has(id)) : values.skillIds,
      depotId:
        depots.data && !depots.data.some((depot) => depot.id === values.depotId)
          ? ''
          : values.depotId,
    }
    try {
      if (technician) {
        await update.mutateAsync({ id: technician.id, body: toTechnicianBody(cleaned) })
      } else {
        await create.mutateAsync(toTechnicianCreateBody(member.userId, cleaned))
      }
      toast.success(t('settings.team.technician.saved'))
      onClose()
    } catch (error) {
      reportSaveError(error, form, t('settings.team.technician.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('settings.team.technician.title')}
        description={member.fullName}
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
        <ColorField
          name="color"
          label={t('settings.team.technician.color')}
          pickerLabel={t('settings.team.technician.colorPicker')}
        />
        <FieldRow>
          <TextField
            name="workStart"
            type="time"
            label={t('settings.team.technician.workStart')}
            required
          />
          <TextField
            name="workEnd"
            type="time"
            label={t('settings.team.technician.workEnd')}
            required
          />
        </FieldRow>
        <WorkingDays />
        <SelectField
          name="depotId"
          label={t('settings.team.technician.depot')}
          emptyLabel={t('settings.team.technician.noDepot')}
          options={(depots.data ?? []).map((depot) => ({ value: depot.id, label: depot.name }))}
        />
        <SkillChoices skills={skills.data} />
        <CheckboxField name="isActive" label={t('settings.team.technician.isActive')} />
      </FormSheet>
    </FormProvider>
  )
}

/** Monday to Sunday, in the tenant's language. */
function WorkingDays() {
  const { t } = useTranslation()
  const { locale } = useTenantFormat()
  const {
    field: { value, onChange },
    fieldState,
  } = useController<TechnicianFormValues, 'workingDays'>({ name: 'workingDays' })
  const error = fieldState.error?.message
  return (
    <FieldSet data-invalid={error ? true : undefined}>
      <FieldLegend variant="label">{t('settings.team.technician.days')}</FieldLegend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ISO_WEEKDAYS.map((day) => {
          const id = `working-day-${String(day)}`
          return (
            <Field key={day} orientation="horizontal" className="w-auto">
              <Checkbox
                id={id}
                checked={value.includes(day)}
                onCheckedChange={(checked) => {
                  onChange(
                    checked === true
                      ? [...value, day].sort((a, b) => a - b)
                      : value.filter((chosen) => chosen !== day),
                  )
                }}
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {weekdayName(day, locale, 'long')}
              </FieldLabel>
            </Field>
          )
        })}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </FieldSet>
  )
}

function SkillChoices({ skills }: { skills: { id: string; name: string }[] | undefined }) {
  const { t } = useTranslation()
  const {
    field: { value, onChange },
  } = useController<TechnicianFormValues, 'skillIds'>({ name: 'skillIds' })
  return (
    <FieldSet>
      <FieldLegend variant="label">{t('settings.team.technician.skills')}</FieldLegend>
      {!skills ? (
        <Skeleton className="h-16" />
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.team.technician.noSkills')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {skills.map((skill) => {
            const id = `technician-skill-${skill.id}`
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
