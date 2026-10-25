import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildSkillSchema,
  type Skill,
  skillFormValues,
  type SkillFormValues,
  toSkillBody,
  useCreateSkill,
  useDeleteSkill,
  useListSkills,
  useUpdateSkill,
} from '@/entities/skill'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

/** The tenant's skills: add, rename, delete. */
export function SkillsSettings() {
  const { t } = useTranslation()
  const skills = useListSkills()
  const [editing, setEditing] = useState<Skill | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Skill | null>(null)

  return (
    <section aria-label={t('settings.skills.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('settings.skills.title')}
        description={t('settings.skills.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('settings.skills.add')}
          </Button>
        }
      />
      {skills.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.skills.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void skills.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !skills.data ? (
        <Skeleton className="h-40" />
      ) : skills.data.length === 0 ? (
        <ConfigListEmpty>{t('settings.skills.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('settings.skills.list')}>
          {skills.data.map((skill) => (
            <ConfigListItem
              key={skill.id}
              title={skill.name}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${skill.name}`}
                    onClick={() => {
                      setEditing(skill)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${skill.name}`}
                    onClick={() => {
                      setDeleting(skill)
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
        <SkillSheet
          skill={editing === 'new' ? undefined : editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteSkillDialog
        skill={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function SkillSheet({ skill, onClose }: { skill?: Skill; onClose: () => void }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildSkillSchema(), [])
  const form = useForm<SkillFormValues>({
    resolver: zodResolver(schema),
    defaultValues: skillFormValues(skill),
  })
  const create = useCreateSkill()
  const update = useUpdateSkill()

  const submit = form.handleSubmit(async (values) => {
    const body = toSkillBody(values)
    try {
      if (skill) await update.mutateAsync({ id: skill.id, body })
      else await create.mutateAsync(body)
      toast.success(t('settings.skills.saved'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        form.setError('name', { message: t('settings.skills.duplicate') })
        return
      }
      reportSaveError(error, form, t('settings.skills.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={skill ? t('settings.skills.editTitle') : t('settings.skills.newTitle')}
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
        <TextField name="name" label={t('settings.skills.name')} required autoFocus />
      </FormSheet>
    </FormProvider>
  )
}

function DeleteSkillDialog({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useDeleteSkill()
  const [error, setError] = useState<string | null>(null)
  // Keeps the name while the dialog closes
  const [last, setLast] = useState<Skill | null>(null)
  if (skill && skill !== last) {
    setLast(skill)
    setError(null)
  }
  const name = (skill ?? last)?.name ?? ''
  return (
    <ConfirmDialog
      open={skill !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('settings.skills.delete.title')}
      description={t('settings.skills.delete.description', { name })}
      confirmLabel={t('settings.skills.delete.confirm')}
      pending={remove.isPending}
      error={error}
      onConfirm={() => {
        if (!skill) return
        remove.mutate(skill.id, {
          onSuccess: () => {
            toast.success(t('settings.skills.delete.done', { name }))
            onClose()
          },
          onError: () => {
            setError(t('settings.skills.delete.failed'))
          },
        })
      }}
    />
  )
}
