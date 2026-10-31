import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type DealActivity, useAddDealNote, useListDealActivities } from '@/entities/deal'
import { useListSalesStages } from '@/entities/sales-stage'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Skeleton } from '@/shared/ui/skeleton'
import { Textarea } from '@/shared/ui/textarea'

/** The deal's timeline, newest first, and a note box. */
export function DealActivities({ dealId }: { dealId: string }) {
  const { t } = useTranslation()
  const id = useId()
  const activities = useListDealActivities(dealId)
  const stages = useListSalesStages({ includeInactive: true })
  const add = useAddDealNote()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const stageName = (stageId: unknown) =>
    stages.data?.find((stage) => stage.id === stageId)?.name ?? '…'

  async function submit() {
    const value = text.trim()
    if (!value) {
      setError(t('sales.activity.noteRequired'))
      return
    }
    setError(null)
    try {
      await add.mutateAsync({ id: dealId, body: { text: value } })
      setText('')
    } catch {
      setError(t('sales.activity.noteFailed'))
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4 rounded-xl border p-4">
      <h2 id={`${id}-title`} className="font-semibold">
        {t('sales.activity.title')}
      </h2>
      <form
        noValidate
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`${id}-note`}>{t('sales.activity.noteLabel')}</FieldLabel>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
          {error && <FieldError role="alert">{error}</FieldError>}
        </Field>
        <Button type="submit" size="sm" disabled={add.isPending}>
          {t('sales.activity.addNote')}
        </Button>
      </form>
      {activities.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.activity.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void activities.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !activities.data ? (
        <Skeleton className="h-24" />
      ) : activities.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sales.activity.empty')}</p>
      ) : (
        <ol aria-label={t('sales.activity.title')} className="space-y-3">
          {activities.data.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} stageName={stageName} />
          ))}
        </ol>
      )}
    </section>
  )
}

function ActivityRow({
  activity,
  stageName,
}: {
  activity: DealActivity
  stageName: (id: unknown) => string
}) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const data = activity.data ?? {}
  const label =
    activity.type === 'stage_changed'
      ? t('sales.activity.type.stage_changed', {
          from: stageName(data.fromStageId),
          to: stageName(data.toStageId),
        })
      : activity.type === 'field_changed'
        ? t('sales.activity.type.field_changed', {
            fields: Array.isArray(data.fields) ? data.fields.join(', ') : '',
          })
        : t(`sales.activity.type.${activity.type}`)
  const actor =
    activity.actor?.fullName ??
    (activity.actorKind === 'ai' ? t('sales.activity.actorAi') : t('sales.activity.actorSystem'))
  return (
    <li className="space-y-0.5 border-l-2 pl-3 text-sm">
      <p className="font-medium">{label}</p>
      {activity.text && <p className="whitespace-pre-wrap">{activity.text}</p>}
      <p className="text-xs text-muted-foreground">
        {actor}, {formatRelativeDateTime(activity.at)}
      </p>
    </li>
  )
}
