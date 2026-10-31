import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConvertDealSheet, ConvertOffer } from '@/widgets/deal-convert'
import { SalesBoardView } from '@/widgets/sales-board'

export function SalesBoardPage() {
  const { t } = useTranslation()
  const [offer, setOffer] = useState<{ id: string; title: string } | null>(null)
  const [converting, setConverting] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <h1 className="sr-only">{t('sales.pages.board')}</h1>
      <SalesBoardView
        onWon={(id, title) => {
          setOffer({ id, title })
        }}
      />
      {offer && (
        <ConvertOffer
          dealTitle={offer.title}
          onLater={() => {
            setOffer(null)
          }}
          onConvert={() => {
            setConverting(offer.id)
            setOffer(null)
          }}
        />
      )}
      {converting && (
        <ConvertDealSheet
          dealId={converting}
          onClose={() => {
            setConverting(null)
          }}
        />
      )}
    </div>
  )
}
