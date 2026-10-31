import type { DealSummary, SalesBoard, SalesBoardColumn } from '@/shared/api/generated/model'

/** The deal in a column, with the column's stage (`DealSummary.stage` is a brief). */
export function findOnBoard(board: SalesBoard, dealId: string): DealSummary | undefined {
  for (const column of board.columns) {
    const deal = column.deals.find((candidate) => candidate.id === dealId)
    if (deal) return deal
  }
  return undefined
}

/**
 * The board as it will look once a deal is in another stage: the deal leaves its column
 * and goes first in the target, and both columns' counts and values follow. The server's
 * answer replaces this; it only keeps the card from jumping back while the request runs.
 * Column order is the API's and is never changed here.
 */
export function moveOnBoard(board: SalesBoard, dealId: string, toStageId: string): SalesBoard {
  const deal = findOnBoard(board, dealId)
  const target = board.columns.find((column) => column.stage.id === toStageId)
  if (!deal || !target || deal.stage.id === toStageId) return board
  const moved: DealSummary = { ...deal, stage: { ...target.stage } }
  return {
    ...board,
    columns: board.columns.map((column): SalesBoardColumn => {
      if (column.stage.id === deal.stage.id) {
        return {
          ...column,
          deals: column.deals.filter((candidate) => candidate.id !== dealId),
          totalCount: Math.max(0, column.totalCount - 1),
          totalValue: subtractMoney(column.totalValue, deal.value),
        }
      }
      if (column.stage.id === toStageId) {
        return {
          ...column,
          deals: [moved, ...column.deals],
          totalCount: column.totalCount + 1,
          totalValue: addMoney(column.totalValue, deal.value),
        }
      }
      return column
    }),
  }
}

/** Cents of a decimal string (`"1250.50"` → 125050). Money is never a float in the UI. */
function toCents(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.split('.')
  return (
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, '0').slice(0, 2)) * (whole.startsWith('-') ? -1n : 1n)
  )
}

function fromCents(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const text = `${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, '0')}`
  return negative ? `-${text}` : text
}

function addMoney(total: string | null | undefined, amount: string | null | undefined) {
  if (!amount) return total ?? null
  return fromCents(toCents(total ?? '0') + toCents(amount))
}

function subtractMoney(total: string | null | undefined, amount: string | null | undefined) {
  if (!amount) return total ?? null
  return fromCents(toCents(total ?? '0') - toCents(amount))
}

/** The follow-up date has come (the instant is now or earlier). */
export function isFollowUpDue(deal: Pick<DealSummary, 'nextFollowUpAt'>, now: number): boolean {
  return !!deal.nextFollowUpAt && new Date(deal.nextFollowUpAt).getTime() <= now
}

/** Whole days since an instant, never negative. */
export function daysSince(instant: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(instant).getTime()) / 86_400_000))
}
