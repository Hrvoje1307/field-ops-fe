import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type Deal, isFollowUpDue, useUpdateDealFollowUp } from '@/entities/deal'
import { addDays, zonedDateTimeToInstant } from '@/shared/lib/datetime'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useNow } from '@/shared/lib/use-now'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'

/** Hour of the day (tenant time) a follow-up falls due at when only a date is chosen. */
const FOLLOW_UP_TIME = '09:00'

/** The deal's next follow-up: mark it done, move it, set it or clear it. Closed deals have none. */
export function DealFollowUp({ deal }: { deal: Deal }) {
  const { t } = useTranslation()
  const { today, timeZone, formatRelativeDateTime } = useTenantFormat()
  const id = useId()
  const update = useUpdateDealFollowUp()
  const [date, setDate] = useState(() => addDays(today(), 1))
  const [error, setError] = useState<string | null>(null)

  const now = useNow()
  if (deal.stage.kind !== 'open') return null
  const due = isFollowUpDue(deal, now)

  async function act(action: 'done' | 'snooze' | 'set' | 'clear') {
    setError(null)
    if ((action === 'snooze' || action === 'set') && !date) {
      setError(t('sales.followUp.dateRequired'))
      return
    }
    try {
      await update.mutateAsync({
        id: deal.id,
        body: {
          action,
          ...(action === 'snooze' || action === 'set'
            ? { until: zonedDateTimeToInstant(date, FOLLOW_UP_TIME, timeZone) }
            : {}),
        },
      })
      toast.success(t('sales.followUp.saved'))
    } catch (failure) {
      setError(salesErrorCode(failure) ? salesErrorMessage(failure) : t('sales.followUp.failed'))
    }
  }

  const busy = update.isPending
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-xl border p-4">
      <h2 id={`${id}-title`} className="font-semibold">
        {t('sales.followUp.title')}
      </h2>
      <p className="text-sm">
        {deal.nextFollowUpAt
          ? t(due ? 'sales.followUp.dueNow' : 'sales.followUp.due', {
              when: formatRelativeDateTime(deal.nextFollowUpAt),
            })
          : t('sales.followUp.none')}
      </p>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>{t('sales.followUp.date')}</FieldLabel>
        <Input
          id={id}
          type="date"
          className="max-w-44"
          value={date}
          onChange={(event) => {
            setDate(event.target.value)
          }}
        />
        {error && <FieldError role="alert">{error}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('set')}>
          {t('sales.followUp.set')}
        </Button>
        {deal.nextFollowUpAt && (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act('snooze')}>
              {t('sales.followUp.snooze')}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void act('done')}>
              {t('sales.followUp.done')}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('clear')}>
              {t('sales.followUp.clear')}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
