import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { ConvertDealSheet } from '@/widgets/deal-convert'
import { DealDetailView } from '@/widgets/deal-detail'

export function DealDetailPage({ dealId }: { dealId: string }) {
  const navigate = useNavigate()
  const [converting, setConverting] = useState(false)
  return (
    <>
      <DealDetailView
        dealId={dealId}
        onConvert={() => {
          setConverting(true)
        }}
        onDeleted={() => {
          void navigate({ to: '/sales/board' })
        }}
      />
      {converting && (
        <ConvertDealSheet
          dealId={dealId}
          onClose={() => {
            setConverting(false)
          }}
        />
      )}
    </>
  )
}
