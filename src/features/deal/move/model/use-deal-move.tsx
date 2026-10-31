import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type Deal, type LostReason, useMoveDeal } from '@/entities/deal'
import type { SalesStage } from '@/entities/sales-stage'
import { ApiError } from '@/shared/api/api-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'

import { LostReasonDialog } from '../ui/lost-reason-dialog'

interface MovingDeal {
  id: string
  title: string
  /** Sent when known (the deal page has it; a board card does not). */
  version?: number
}

type MoveTarget = Pick<SalesStage, 'id' | 'name' | 'kind'>

/**
 * Moving a deal to a stage, for the board and the deal page. A lost stage first asks for
 * the reason and nothing is sent until it is confirmed; cancelling leaves the deal where
 * it was. The move itself is optimistic (see `useMoveDeal`). `onWon` is called with the
 * moved deal when the target stage is a won one and the deal has no job yet, so the screen
 * can offer the conversion.
 * Render `dialog` somewhere on the screen.
 */
export function useDealMove({ onWon }: { onWon?: (deal: Deal) => void } = {}): {
  request: (deal: MovingDeal, stage: MoveTarget) => void
  dialog: ReactNode
  pending: boolean
} {
  const { t } = useTranslation()
  const move = useMoveDeal()
  const [asking, setAsking] = useState<{ deal: MovingDeal; stage: MoveTarget } | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function run(
    deal: MovingDeal,
    stage: MoveTarget,
    lost?: { reason: LostReason; note: string },
  ) {
    try {
      const moved = await move.mutateAsync({
        id: deal.id,
        body: {
          stageId: stage.id,
          ...(lost
            ? { lostReason: lost.reason, ...(lost.note ? { lostNote: lost.note } : {}) }
            : {}),
          ...(deal.version === undefined ? {} : { version: deal.version }),
        },
      })
      setAsking(null)
      // A deal that already has its job is not offered the conversion again
      if (stage.kind === 'won' && !moved.jobId) onWon?.(moved)
      else toast.success(t('sales.board.moved', { stage: stage.name }))
    } catch (error) {
      const reason = error instanceof ApiError ? error.fieldErrors.lostReason : undefined
      if (lost && reason) {
        setReasonError(reason.join(' '))
        return
      }
      // A 409 has been told by the hook already
      if (error instanceof ApiError && error.status === 409) {
        setAsking(null)
        return
      }
      const message = salesErrorCode(error) ? salesErrorMessage(error) : t('sales.board.moveFailed')
      if (lost) setFailure(message)
      else toast.error(message)
    }
  }

  return {
    request: (deal, stage) => {
      if (stage.kind === 'lost') {
        setReasonError(null)
        setFailure(null)
        setAsking({ deal, stage })
        return
      }
      void run(deal, stage)
    },
    pending: move.isPending,
    dialog: asking && (
      <LostReasonDialog
        dealTitle={asking.deal.title}
        stageName={asking.stage.name}
        pending={move.isPending}
        reasonError={reasonError}
        failure={failure}
        onCancel={() => {
          setAsking(null)
        }}
        onConfirm={(reason, note) => {
          setReasonError(null)
          setFailure(null)
          void run(asking.deal, asking.stage, { reason, note })
        }}
      />
    ),
  }
}
