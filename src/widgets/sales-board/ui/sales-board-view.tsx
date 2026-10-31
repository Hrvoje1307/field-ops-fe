import { useTranslation } from 'react-i18next'

import { CreateDealButton } from '@/features/deal/create'
import { useDealMove } from '@/features/deal/move'
import { SalesBoard } from '@/features/sales/board'

/**
 * The funnel with its actions: a new deal, and moving cards. Dropping a card in a lost
 * stage asks for the reason first; dropping it in a won stage hands the deal to `onWon`
 * so the page can offer the conversion.
 */
export function SalesBoardView({ onWon }: { onWon: (dealId: string, title: string) => void }) {
  const { t } = useTranslation()
  const { request, dialog } = useDealMove({
    onWon: (deal) => {
      onWon(deal.id, deal.title)
    },
  })
  return (
    <section aria-label={t('sales.pages.board')} className="space-y-4">
      <div className="flex justify-end">
        <CreateDealButton />
      </div>
      <SalesBoard
        emptyAction={<CreateDealButton />}
        onMove={(deal, stage) => {
          request({ id: deal.id, title: deal.title }, stage)
        }}
      />
      {dialog}
    </section>
  )
}
