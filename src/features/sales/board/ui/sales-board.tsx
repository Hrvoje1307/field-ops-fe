import { SearchIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type DealSummary, type SalesBoardColumn, useGetSalesBoard } from '@/entities/deal'
import type { SalesStage } from '@/entities/sales-stage'
import { useIsMobile } from '@/shared/lib/use-is-mobile'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { DragBoard, DragColumn, DragItem } from '@/shared/ui/drag-board'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'

import { DealCard } from './deal-card'
import { StageList } from './stage-list'

/**
 * The funnel: a column per stage in the order the API gives (the stages are the tenant's,
 * the client never sorts them). Dropping a card in another column only reports the
 * intent (`onMove`); the screen decides what to ask (a lost stage needs a reason) and
 * saves it, and the columns redraw from the cache.
 */
export function SalesBoard({
  onMove,
  emptyAction,
}: {
  onMove: (deal: DealSummary, stage: SalesStage) => void
  /** What to offer when the tenant has no deals at all ("Nova prilika"). */
  emptyAction?: ReactNode
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 300)
  const board = useGetSalesBoard(q ? { q } : {})
  const mobile = useIsMobile()

  const columns = board.data?.columns
  const deals = useMemo(() => {
    const map = new Map<string, DealSummary>()
    for (const column of columns ?? []) for (const deal of column.deals) map.set(deal.id, deal)
    return map
  }, [columns])
  const layout = useMemo(
    () =>
      Object.fromEntries(
        (columns ?? []).map((column) => [column.stage.id, column.deals.map((deal) => deal.id)]),
      ),
    [columns],
  )
  const stageOf = useCallback(
    (id: string) => columns?.find((column) => column.stage.id === id)?.stage,
    [columns],
  )

  const search = (
    <div className="relative max-w-xs flex-1 max-md:max-w-none">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={t('sales.board.search')}
        placeholder={t('sales.board.search')}
        autoComplete="off"
        className="pl-8 max-md:h-11"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
        }}
      />
    </div>
  )

  if (board.isError && !board.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('sales.board.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void board.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (!columns) {
    return (
      <div aria-busy="true" className="flex gap-3 overflow-hidden">
        <span className="sr-only">{t('common.loading')}</span>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-64 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    )
  }

  const total = columns.reduce((sum, column) => sum + column.totalCount, 0)
  if (total === 0) {
    return (
      <div className="space-y-4">
        {search}
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">
            {q ? t('sales.board.noResults', { query: q }) : t('sales.board.emptyTitle')}
          </p>
          {!q && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('sales.board.emptyDescription')}
              </p>
              {emptyAction && <div className="mt-4 flex justify-center">{emptyAction}</div>}
            </>
          )}
        </div>
        <Stages columns={columns} />
      </div>
    )
  }

  if (mobile) {
    return (
      <div className="space-y-4">
        {search}
        <StageList columns={columns} onMove={onMove} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {search}
      <DragBoard
        layout={layout}
        nameOf={(id) => deals.get(id)?.title ?? ''}
        listNameOf={(id) => stageOf(id)?.name ?? ''}
        renderOverlay={(id) => {
          const deal = deals.get(id)
          return deal ? <DealCard deal={deal} /> : null
        }}
        onMove={(move) => {
          // Cards inside a column keep the order the API gives them
          if (move.fromId === move.toId) return
          const deal = deals.get(move.itemId)
          const stage = stageOf(move.toId)
          if (deal && stage) onMove(deal, stage)
        }}
      >
        <Stages columns={columns} movable />
      </DragBoard>
    </div>
  )
}

function Stages({ columns, movable = false }: { columns: SalesBoardColumn[]; movable?: boolean }) {
  const { t } = useTranslation()
  const { formatMoney } = useTenantFormat()
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
    setMore((now) => (now.left === left && now.right === right ? now : { left, right }))
  }, [])
  useEffect(() => {
    measure()
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [measure, columns.length])
  return (
    <div className="relative min-w-0">
      {more.left && (
        <div
          aria-hidden="true"
          data-testid="board-more-left"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent"
        />
      )}
      {more.right && (
        <div
          aria-hidden="true"
          data-testid="board-more-right"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent"
        />
      )}
      <div
        ref={scroller}
        onScroll={measure}
        role="region"
        aria-label={t('sales.board.region')}
        className="flex items-start gap-3 overflow-x-auto pb-3"
      >
        {columns.map((column) => (
          <DragColumn
            key={column.stage.id}
            id={column.stage.id}
            testId={`stage-${column.stage.id}`}
            label={column.stage.name}
            title={
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: column.stage.color }}
                />
                {column.stage.name}
              </span>
            }
            subtitle={[
              t('sales.board.stageCount', { count: column.totalCount }),
              column.totalValue ? formatMoney(column.totalValue) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            itemIds={column.deals.map((deal) => deal.id)}
            empty={t('sales.board.emptyStage')}
          >
            {movable &&
              column.deals.map((deal) => (
                <DragItem
                  key={deal.id}
                  id={deal.id}
                  listId={column.stage.id}
                  testId={`deal-${deal.id}`}
                  handleLabel={t('sales.board.handle', { name: deal.title })}
                >
                  {(handle) => <DealCard deal={deal} handle={handle} />}
                </DragItem>
              ))}
            {!movable &&
              column.deals.map((deal) => (
                <li key={deal.id}>
                  <DealCard deal={deal} />
                </li>
              ))}
            {column.totalCount > column.deals.length && (
              <li className="px-1 text-xs text-muted-foreground">
                {t('sales.board.shown', { shown: column.deals.length, total: column.totalCount })}
              </li>
            )}
          </DragColumn>
        ))}
      </div>
    </div>
  )
}
