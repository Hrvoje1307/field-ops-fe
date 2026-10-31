import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildStageSchema,
  reorderedIds,
  type SalesStage,
  stageFormValues,
  type StageFormValues,
  toStageBody,
  useCreateSalesStage,
  useDeleteSalesStage,
  useListSalesStages,
  useReorderSalesStages,
  useUpdateSalesStage,
} from '@/entities/sales-stage'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { ColorField } from '@/shared/ui/color-field'
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
import { FieldRow, TextField } from '@/shared/ui/text-field'

const KINDS = ['open', 'won', 'lost'] as const

/**
 * The funnel's stages: name, colour, kind and follow-up days are the tenant's, from the
 * API. The list order is the order of the board's columns.
 */
export function SalesStagesSettings() {
  const { t } = useTranslation()
  const stages = useListSalesStages({ includeInactive: true })
  const reorder = useReorderSalesStages()
  const [editing, setEditing] = useState<SalesStage | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SalesStage | null>(null)

  const ids = (stages.data ?? []).map((stage) => stage.id)
  function move(stage: SalesStage, step: -1 | 1) {
    reorder.mutate(
      { stageIds: reorderedIds(ids, stage.id, step) },
      {
        onError: (error) => {
          toast.error(
            salesErrorCode(error) ? salesErrorMessage(error) : t('sales.stages.reorderFailed'),
          )
        },
      },
    )
  }

  return (
    <section aria-label={t('sales.stages.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('sales.stages.title')}
        description={t('sales.stages.description')}
        action={
          <Button
            onClick={() => {
              setEditing('new')
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('sales.stages.add')}
          </Button>
        }
      />
      {stages.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.stages.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void stages.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !stages.data ? (
        <Skeleton className="h-40" />
      ) : stages.data.length === 0 ? (
        <ConfigListEmpty>{t('sales.stages.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('sales.stages.list')}>
          {stages.data.map((stage, index) => (
            <ConfigListItem
              key={stage.id}
              leading={
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {stage.name}
                  {!stage.isActive && <Badge variant="outline">{t('sales.stages.inactive')}</Badge>}
                </span>
              }
              meta={[
                t(`sales.stages.kindLabel.${stage.kind}`),
                stage.followUpDays ? t('sales.stages.follow', { days: stage.followUpDays }) : null,
                stage.staleAfterDays
                  ? t('sales.stages.stale', { days: stage.staleAfterDays })
                  : null,
                stage.isActive ? null : t('sales.stages.inactiveHint'),
              ]
                .filter(Boolean)
                .join(', ')}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0 || reorder.isPending}
                    aria-label={t('sales.stages.moveUp', { name: stage.name })}
                    onClick={() => {
                      move(stage, -1)
                    }}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === ids.length - 1 || reorder.isPending}
                    aria-label={t('sales.stages.moveDown', { name: stage.name })}
                    onClick={() => {
                      move(stage, 1)
                    }}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.edit')}: ${stage.name}`}
                    onClick={() => {
                      setEditing(stage)
                    }}
                  >
                    <PencilIcon aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${t('common.delete')}: ${stage.name}`}
                    onClick={() => {
                      setDeleting(stage)
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
        <StageSheet
          stage={editing === 'new' ? undefined : editing}
          fallbackColor={stages.data?.findLast((stage) => stage.kind === 'open')?.color ?? ''}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      <DeleteStageDialog
        stage={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function StageSheet({
  stage,
  fallbackColor,
  onClose,
}: {
  stage?: SalesStage
  fallbackColor: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildStageSchema(), [])
  const form = useForm<StageFormValues>({
    resolver: zodResolver(schema),
    defaultValues: stageFormValues(stage, fallbackColor),
  })
  const create = useCreateSalesStage()
  const update = useUpdateSalesStage()
  const active = useWatch({ control: form.control, name: 'isActive' })

  const submit = form.handleSubmit(async (values) => {
    const body = toStageBody(values)
    try {
      if (stage) await update.mutateAsync({ id: stage.id, body })
      else await create.mutateAsync(body)
      toast.success(t('sales.stages.saved'))
      onClose()
    } catch (error) {
      // 409 `sales.stage_required` and the like: said as the API says them
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.stages.saveFailed'),
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
        title={stage ? t('sales.stages.editTitle') : t('sales.stages.newTitle')}
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
        <TextField name="name" label={t('sales.stages.name')} required autoComplete="off" />
        <ColorField
          name="color"
          label={t('sales.stages.color')}
          pickerLabel={t('sales.stages.colorPicker')}
        />
        <SelectField
          name="kind"
          label={t('sales.stages.kind')}
          emptyLabel={t('sales.stages.kind')}
          options={KINDS.map((kind) => ({
            value: kind,
            label: t(`sales.stages.kindLabel.${kind}`),
          }))}
        />
        <FieldRow>
          <TextField
            name="followUpDays"
            label={t('sales.stages.followUpDays')}
            hint={t('sales.stages.followUpDaysHint')}
            inputMode="numeric"
            autoComplete="off"
          />
          <TextField
            name="staleAfterDays"
            label={t('sales.stages.staleAfterDays')}
            hint={t('sales.stages.staleAfterDaysHint')}
            inputMode="numeric"
            autoComplete="off"
          />
        </FieldRow>
        <CheckboxField
          name="isActive"
          label={t('sales.stages.active')}
          hint={active ? undefined : t('sales.stages.inactiveHint')}
        />
      </FormSheet>
    </FormProvider>
  )
}

function DeleteStageDialog({ stage, onClose }: { stage: SalesStage | null; onClose: () => void }) {
  const { t } = useTranslation()
  const remove = useDeleteSalesStage()
  return (
    <ConfirmDialog
      open={stage !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset()
          onClose()
        }
      }}
      title={t('sales.stages.deleteTitle')}
      description={t('sales.stages.deleteDescription', { name: stage?.name ?? '' })}
      confirmLabel={t('sales.stages.deleteConfirm')}
      pending={remove.isPending}
      error={
        remove.isError
          ? salesErrorCode(remove.error)
            ? salesErrorMessage(remove.error)
            : t('sales.stages.deleteFailed')
          : null
      }
      onConfirm={() => {
        if (!stage) return
        remove.mutate(stage.id, {
          onSuccess: () => {
            toast.success(t('sales.stages.deleted'))
            onClose()
          },
        })
      }}
    />
  )
}
