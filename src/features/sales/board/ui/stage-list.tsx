import { useTranslation } from 'react-i18next'

import type { DealSummary, SalesBoardColumn } from '@/entities/deal'
import type { SalesStage } from '@/entities/sales-stage'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'

import { DealCard } from './deal-card'

/**
 * The funnel on a phone: the stages one under the other, in the order the API gives them,
 * each with its deals. A card is moved with "Premjesti u…" (the phone's own picker), not by
 * dragging; what moving asks (a reason for a lost stage, the conversion after a won one) is
 * the screen's, through `onMove`, the same as when dragging.
 */
export function StageList({
  columns,
  onMove,
}: {
  columns: SalesBoardColumn[]
  onMove: (deal: DealSummary, stage: SalesStage) => void
}) {
  const { t } = useTranslation()
  const { formatMoney } = useTenantFormat()
  return (
    <div role="region" aria-label={t('sales.board.region')} className="space-y-6">
      {columns.map((column) => (
        <section
          key={column.stage.id}
          aria-label={column.stage.name}
          data-testid={`stage-${column.stage.id}`}
          className="space-y-2"
        >
          <header className="space-y-0.5">
            <h2 className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: column.stage.color }}
              />
              {column.stage.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {[
                t('sales.board.stageCount', { count: column.totalCount }),
                column.totalValue ? formatMoney(column.totalValue) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </header>
          <ul className="space-y-2">
            {column.deals.length === 0 && (
              <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                {t('sales.board.emptyStage')}
              </li>
            )}
            {column.deals.map((deal) => (
              <li key={deal.id} data-testid={`deal-${deal.id}`}>
                <DealCard
                  deal={deal}
                  footer={
                    <MoveSelect
                      deal={deal}
                      stages={columns.map((c) => c.stage).filter((s) => s.id !== column.stage.id)}
                      onMove={onMove}
                    />
                  }
                />
              </li>
            ))}
            {column.totalCount > column.deals.length && (
              <li className="px-1 text-xs text-muted-foreground">
                {t('sales.board.shown', { shown: column.deals.length, total: column.totalCount })}
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

function MoveSelect({
  deal,
  stages,
  onMove,
}: {
  deal: DealSummary
  stages: SalesStage[]
  onMove: (deal: DealSummary, stage: SalesStage) => void
}) {
  const { t } = useTranslation()
  return (
    <NativeSelect
      className="w-full max-md:[&_select]:h-11"
      aria-label={t('sales.board.moveToDeal', { name: deal.title })}
      value=""
      onChange={(event) => {
        const stage = stages.find((candidate) => candidate.id === event.target.value)
        if (stage) onMove(deal, stage)
      }}
    >
      <NativeSelectOption value="">{t('sales.board.moveTo')}</NativeSelectOption>
      {stages.map((stage) => (
        <NativeSelectOption key={stage.id} value={stage.id}>
          {stage.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
