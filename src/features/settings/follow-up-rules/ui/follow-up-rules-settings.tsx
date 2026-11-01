import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSalesAccess } from '@/entities/auth'
import {
  buildRuleSchema,
  type FollowUpRule,
  ruleFormValues,
  type RuleFormValues,
  toRuleBody,
  useCreateFollowUpRule,
  useDeleteFollowUpRule,
  useGetSalesSettings,
  useListFollowUpRules,
  useUpdateFollowUpRule,
} from '@/entities/sales-config'
import { type SalesStage, useListSalesStages } from '@/entities/sales-stage'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import {
  ConfigList,
  ConfigListEmpty,
  ConfigListHeader,
  ConfigListItem,
} from '@/shared/ui/config-list'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { FormSheet } from '@/shared/ui/form-sheet'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

/**
 * When a conversation we wrote last gets no reply for some business days, Today lists it.
 * The stage is one of the tenant's open stages (none = all of them); the stage names come
 * from the API. Preparing a draft is the AI's, so that switch needs `sales_ai`.
 */
export function FollowUpRulesSettings() {
  const { t } = useTranslation()
  const rules = useListFollowUpRules()
  const stages = useListSalesStages({ includeInactive: true })
  const [editing, setEditing] = useState<FollowUpRule | 'new' | null>(null)
  const [deleting, setDeleting] = useState<FollowUpRule | null>(null)
  const stageName = (id: string | null | undefined) =>
    id ? (stages.data?.find((stage) => stage.id === id)?.name ?? '') : t('sales.rules.allStages')

  return (
    <section aria-label={t('sales.rules.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('sales.rules.title')}
        description={t('sales.rules.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('sales.rules.add')}
          </Button>
        }
      />
      {rules.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.rules.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void rules.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !rules.data ? (
        <Skeleton className="h-32" />
      ) : rules.data.length === 0 ? (
        <ConfigListEmpty>{t('sales.rules.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('sales.rules.list')}>
          {rules.data.map((rule) => (
            <ConfigListItem
              key={rule.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {rule.name}
                  {!rule.isActive && <Badge variant="outline">{t('sales.rules.inactive')}</Badge>}
                </span>
              }
              meta={[
                t('sales.rules.meta', {
                  stage: stageName(rule.stageId),
                  days: rule.daysWithoutReply,
                }),
                rule.createDraft ? t('sales.rules.draftMeta') : null,
              ]
                .filter(Boolean)
                .join(', ')}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${rule.name}`}
                    onClick={() => {
                      setEditing(rule)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${rule.name}`}
                    onClick={() => {
                      setDeleting(rule)
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
        <RuleSheet
          rule={editing === 'new' ? undefined : editing}
          stages={(stages.data ?? []).filter((stage) => stage.kind === 'open')}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteRuleDialog
        rule={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function RuleSheet({
  rule,
  stages,
  onClose,
}: {
  rule?: FollowUpRule
  stages: readonly SalesStage[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { hasAi } = useSalesAccess()
  const settings = useGetSalesSettings()
  const schema = useMemo(() => buildRuleSchema(), [])
  const form = useForm<RuleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: ruleFormValues(rule),
  })
  const create = useCreateFollowUpRule()
  const update = useUpdateFollowUpRule()
  const aiOff = settings.data?.aiEnabled === false

  const submit = form.handleSubmit(async (values) => {
    const body = toRuleBody(values)
    try {
      if (rule) await update.mutateAsync({ id: rule.id, body })
      else await create.mutateAsync(body)
      toast.success(t('sales.rules.saved'))
      onClose()
    } catch (error) {
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.rules.saveFailed'),
      )
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={rule ? t('sales.rules.editTitle') : t('sales.rules.newTitle')}
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
        <TextField name="name" label={t('sales.rules.name')} required autoComplete="off" />
        <SelectField
          name="stageId"
          label={t('sales.rules.stage')}
          emptyLabel={t('sales.rules.allStages')}
          options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
        />
        <TextField
          name="daysWithoutReply"
          label={t('sales.rules.days')}
          hint={t('sales.rules.daysHint')}
          inputMode="numeric"
          autoComplete="off"
          required
        />
        <CheckboxField
          name="createDraft"
          label={t('sales.rules.createDraft')}
          hint={
            !hasAi
              ? t('sales.rules.createDraftNoAi')
              : aiOff
                ? t('sales.settings.ai.off')
                : t('sales.rules.createDraftHint')
          }
          disabled={!hasAi}
        />
        <CheckboxField name="isActive" label={t('sales.rules.active')} />
      </FormSheet>
    </FormProvider>
  )
}

function DeleteRuleDialog({ rule, onClose }: { rule: FollowUpRule | null; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useDeleteFollowUpRule()
  return (
    <ConfirmDialog
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset()
          onClose()
        }
      }}
      title={t('sales.rules.deleteTitle')}
      description={t('sales.rules.deleteDescription', { name: rule?.name ?? '' })}
      confirmLabel={t('sales.rules.deleteConfirm')}
      pending={remove.isPending}
      error={
        remove.isError
          ? salesErrorCode(remove.error)
            ? salesErrorMessage(remove.error)
            : t('sales.rules.deleteFailed')
          : null
      }
      onConfirm={() => {
        if (!rule) return
        remove.mutate(rule.id, {
          onSuccess: () => {
            toast.success(t('sales.rules.deleted'))
            onClose()
          },
        })
      }}
    />
  )
}
