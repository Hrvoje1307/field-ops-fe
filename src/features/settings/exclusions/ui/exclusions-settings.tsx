import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildExclusionSchema,
  emptyExclusion,
  type ExclusionFormValues,
  type ExclusionRule,
  toExclusionBody,
  useCreateExclusionRule,
  useDeleteExclusionRule,
  useListExclusionRules,
} from '@/entities/sales-config'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
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

/** Senders and whole domains whose mail is never processed. Rules made from a conversation are listed too. */
export function ExclusionsSettings() {
  const { t } = useTranslation()
  const { formatDateTime } = useTenantFormat()
  const rules = useListExclusionRules()
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<ExclusionRule | null>(null)

  return (
    <section aria-label={t('sales.exclusions.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('sales.exclusions.title')}
        description={t('sales.exclusions.description')}
        action={
          <Button
            onClick={() => {
              setAdding(true)
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t('sales.exclusions.add')}
          </Button>
        }
      />
      {rules.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.exclusions.loadFailed')}</AlertDescription>
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
        <ConfigListEmpty>{t('sales.exclusions.empty')}</ConfigListEmpty>
      ) : (
        <ConfigList label={t('sales.exclusions.list')}>
          {rules.data.map((rule) => (
            <ConfigListItem
              key={rule.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {rule.pattern}
                  <Badge variant="outline">
                    {rule.pattern.startsWith('@')
                      ? t('sales.exclusions.domain')
                      : t('sales.exclusions.address')}
                  </Badge>
                </span>
              }
              meta={[
                rule.note,
                t('sales.exclusions.createdAt', {
                  date: formatDateTime(rule.createdAt, { dateStyle: 'medium' }),
                }),
              ]
                .filter(Boolean)
                .join(', ')}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('common.delete')}: ${rule.pattern}`}
                  onClick={() => {
                    setDeleting(rule)
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              }
            />
          ))}
        </ConfigList>
      )}
      {adding && (
        <ExclusionSheet
          onClose={() => {
            setAdding(false)
          }}
        />
      )}
      <DeleteExclusionDialog
        rule={deleting}
        onClose={() => {
          setDeleting(null)
        }}
      />
    </section>
  )
}

function ExclusionSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildExclusionSchema(), [])
  const form = useForm<ExclusionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyExclusion(),
  })
  const create = useCreateExclusionRule()

  const submit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(toExclusionBody(values))
      toast.success(t('sales.exclusions.saved'))
      onClose()
    } catch (error) {
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.exclusions.saveFailed'),
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
        title={t('sales.exclusions.newTitle')}
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
        <TextField
          name="pattern"
          label={t('sales.exclusions.pattern')}
          hint={t('sales.exclusions.patternHint')}
          autoComplete="off"
          required
        />
        <TextField name="note" label={t('sales.exclusions.note')} autoComplete="off" />
      </FormSheet>
    </FormProvider>
  )
}

function DeleteExclusionDialog({
  rule,
  onClose,
}: {
  rule: ExclusionRule | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const remove = useDeleteExclusionRule()
  return (
    <ConfirmDialog
      open={rule !== null}
      onOpenChange={(open) => {
        if (!open) {
          remove.reset()
          onClose()
        }
      }}
      title={t('sales.exclusions.deleteTitle')}
      description={t('sales.exclusions.deleteDescription', { pattern: rule?.pattern ?? '' })}
      confirmLabel={t('sales.exclusions.deleteConfirm')}
      confirmVariant="default"
      pending={remove.isPending}
      error={
        remove.isError
          ? salesErrorCode(remove.error)
            ? salesErrorMessage(remove.error)
            : t('sales.exclusions.deleteFailed')
          : null
      }
      onConfirm={() => {
        if (!rule) return
        remove.mutate(rule.id, {
          onSuccess: () => {
            toast.success(t('sales.exclusions.deleted'))
            onClose()
          },
        })
      }}
    />
  )
}
