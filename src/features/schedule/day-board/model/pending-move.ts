import { useState } from 'react'

import { applyMove, type DragLayout, type DragMove } from '@/shared/lib/drag-move'

interface Pending {
  move: DragMove
  /** `dataUpdatedAt` of the board the move was made on. */
  boardStamp: number
}

/**
 * Where a dropped card sits until the board has been fetched again. The move is shown
 * only on top of the very board it was made on (`boardStamp`): once newer data has
 * arrived the server's word is shown, whatever it says, and a move that failed is
 * cleared so no later refetch can bring it back.
 */
export function usePendingMove(boardStamp: number) {
  const [pending, setPending] = useState<Pending | null>(null)
  return {
    begin: (move: DragMove) => {
      setPending({ move, boardStamp })
    },
    clear: () => {
      setPending(null)
    },
    /** The lists with the pending move on top of `saved`, when it still applies. */
    apply: (saved: DragLayout): DragLayout =>
      pending?.boardStamp === boardStamp ? applyMove(saved, pending.move) : saved,
  }
}
