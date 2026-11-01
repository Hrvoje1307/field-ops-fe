import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/auth'
import { useSalesMembers } from '@/entities/member'
import {
  isValidPeriod,
  matchPreset,
  periodFromSearch,
  presetPeriod,
  REPORT_PRESETS,
  type ReportPeriod,
  type SalesReport,
  useGetSalesReport,
} from '@/entities/sales-report'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { BarList } from '@/shared/ui/bar-list'
import { Button } from '@/shared/ui/button'
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'

import type { ReportSearch, ReportSearchChange } from '../model/search'

/**
 * Conversion, time per stage and lost reasons for a period. Every figure is the API's: the
 * screen only formats them (money as the decimal string it is, minutes as hours and minutes)
 * and draws bars for the three lists. Owners may look at one person.
 */
export function SalesReportView({
  search,
  onSearchChange,
}: {
  search: ReportSearch
  onSearchChange: ReportSearchChange
}) {
  const { t } = useTranslation()
  const me = useMe()
  const { today } = useTenantFormat()
  const todayDate = today()
  const period = periodFromSearch(search, todayDate)
  const isOwner = me.role === 'owner'
  const owner = isOwner ? search.owner : undefined
  const report = useGetSalesReport({
    from: period.from,
    to: period.to,
    ...(owner ? { ownerUserId: owner } : {}),
  })

  return (
    <section aria-label={t('sales.report.region')} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodControls
          key={`${period.from}|${period.to}`}
          period={period}
          today={todayDate}
          onChange={(next) => {
            onSearchChange(next)
          }}
        />
        {isOwner && (
          <OwnerPicker
            value={owner ?? ''}
            onChange={(value) => {
              onSearchChange({ owner: value || undefined })
            }}
          />
        )}
      </div>

      {report.isPending ? (
        <div aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <span className="sr-only">{t('common.loading')}</span>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : report.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.report.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void report.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <div className="space-y-6" aria-busy={report.isFetching}>
          {report.isFetching && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('sales.report.updating')}
            </p>
          )}
          <ReportBody report={report.data} />
        </div>
      )}
    </section>
  )
}

function PeriodControls({
  period,
  today,
  onChange,
}: {
  period: ReportPeriod
  today: string
  onChange: (period: ReportPeriod) => void
}) {
  const { t } = useTranslation()
  const fromId = useId()
  const toId = useId()
  const [draft, setDraft] = useState(period)
  const active = matchPreset(period, today)
  const reversed = draft.from !== '' && draft.to !== '' && draft.from > draft.to

  function edit(patch: Partial<ReportPeriod>) {
    const next = { ...draft, ...patch }
    setDraft(next)
    if (isValidPeriod(next)) onChange(next)
  }

  return (
    <div className="space-y-3">
      <div role="group" aria-label={t('sales.report.presets')} className="flex flex-wrap gap-2">
        {REPORT_PRESETS.map((preset) => (
          <Button
            key={preset}
            size="sm"
            variant={active === preset ? 'default' : 'outline'}
            aria-pressed={active === preset}
            onClick={() => {
              onChange(presetPeriod(preset, today))
            }}
          >
            {t(`sales.report.preset.${preset}`)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Field className="w-auto">
          <FieldLabel htmlFor={fromId}>{t('sales.report.from')}</FieldLabel>
          <Input
            id={fromId}
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            aria-invalid={reversed || undefined}
            onChange={(event) => {
              edit({ from: event.target.value })
            }}
          />
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor={toId}>{t('sales.report.to')}</FieldLabel>
          <Input
            id={toId}
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            aria-invalid={reversed || undefined}
            onChange={(event) => {
              edit({ to: event.target.value })
            }}
          />
        </Field>
      </div>
      {reversed && <FieldError>{t('sales.report.rangeInvalid')}</FieldError>}
    </div>
  )
}

function OwnerPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const members = useSalesMembers()
  return (
    <Field className="w-auto">
      <FieldLabel htmlFor={id}>{t('sales.report.owner')}</FieldLabel>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      >
        <NativeSelectOption value="">{t('sales.report.ownerAll')}</NativeSelectOption>
        {(members.data ?? []).map((member) => (
          <NativeSelectOption key={member.userId} value={member.userId}>
            {member.fullName}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

function ReportBody({ report }: { report: SalesReport }) {
  const { t } = useTranslation()
  const { formatMoney, formatDuration, formatNumber, locale } = useTenantFormat()
  const empty = report.dealsCreated === 0 && report.dealsWon === 0 && report.dealsLost === 0
  if (empty) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center">
        <p className="font-medium">{t('sales.report.emptyTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('sales.report.emptyDescription')}</p>
      </div>
    )
  }

  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 })
  const figures: { key: string; label: string; value: string; hint?: string }[] = [
    { key: 'created', label: t('sales.report.created'), value: formatNumber(report.dealsCreated) },
    { key: 'won', label: t('sales.report.won'), value: formatNumber(report.dealsWon) },
    { key: 'lost', label: t('sales.report.lost'), value: formatNumber(report.dealsLost) },
    {
      key: 'winRate',
      label: t('sales.report.winRate'),
      value:
        report.winRate == null ? t('sales.report.winRateNone') : percent.format(report.winRate),
      hint: t('sales.report.winRateHint'),
    },
    {
      key: 'openValue',
      label: t('sales.report.openValue'),
      value: report.openValue ? formatMoney(report.openValue) : t('sales.report.noValue'),
    },
    {
      key: 'wonValue',
      label: t('sales.report.wonValue'),
      value: report.wonValue ? formatMoney(report.wonValue) : t('sales.report.noValue'),
    },
    {
      key: 'response',
      label: t('sales.report.response'),
      value:
        report.medianFirstResponseMinutes == null
          ? t('sales.report.responseNone')
          : formatDuration(report.medianFirstResponseMinutes),
    },
  ]

  return (
    <>
      <dl
        aria-label={t('sales.report.summary')}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {figures.map((figure) => (
          <div
            key={figure.key}
            className="rounded-xl border p-4"
            data-testid={`figure-${figure.key}`}
          >
            <dt className="text-sm text-muted-foreground">{figure.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{figure.value}</dd>
            {figure.hint && <p className="mt-1 text-xs text-muted-foreground">{figure.hint}</p>}
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSection title={t('sales.report.stageTimes')} empty={report.stageTimes.length === 0}>
          <BarList
            label={t('sales.report.stageTimes')}
            items={report.stageTimes.map((stage) => ({
              key: stage.stageId,
              label: stage.name,
              value: stage.avgDays,
              text: t('sales.report.stageDays', { days: formatNumber(stage.avgDays) }),
            }))}
          />
        </ChartSection>
        <ChartSection title={t('sales.report.lostReasons')} empty={report.lostReasons.length === 0}>
          <BarList
            label={t('sales.report.lostReasons')}
            items={report.lostReasons.map((row) => ({
              key: row.reason,
              label: t(`sales.lostReason.${row.reason}`),
              value: row.count,
              text: formatNumber(row.count),
            }))}
          />
        </ChartSection>
        <ChartSection title={t('sales.report.bySource')} empty={report.bySource.length === 0}>
          <BarList
            label={t('sales.report.bySource')}
            items={report.bySource.map((row) => ({
              key: row.source,
              label: t(`sales.source.${row.source}`),
              value: row.created,
              part: row.won,
              text: `${t('sales.report.sourceCreated', { count: row.created })}, ${t('sales.report.sourceWon', { count: row.won })}`,
            }))}
          />
        </ChartSection>
      </div>
    </>
  )
}

function ChartSection({
  title,
  empty,
  children,
}: {
  title: string
  empty: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={title} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">{title}</h3>
      {empty ? (
        <p className="text-sm text-muted-foreground">{t('sales.report.noRows')}</p>
      ) : (
        children
      )}
    </section>
  )
}
