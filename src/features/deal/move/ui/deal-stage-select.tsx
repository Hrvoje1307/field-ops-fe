import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type { Deal } from '@/entities/deal'
import { useListSalesStages } from '@/entities/sales-stage'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'

import { useDealMove } from '../model/use-deal-move'

/** Changes a deal's stage from its page; stages and their order come from the API. */
export function DealStageSelect({
  deal,
  onWon,
}: {
  deal: Pick<Deal, 'id' | 'title' | 'version' | 'stage'>
  onWon?: (deal: Deal) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const stages = useListSalesStages()
  const { request, dialog, pending } = useDealMove({ onWon })
  const options = (stages.data ?? []).filter(
    (stage) => stage.isActive || stage.id === deal.stage.id,
  )
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {t('sales.deal.fields.stage')}
      </label>
      <NativeSelect
        id={id}
        className="max-md:[&_select]:h-11"
        value={deal.stage.id}
        disabled={pending || !stages.data}
        onChange={(event) => {
          const stage = options.find((candidate) => candidate.id === event.target.value)
          if (stage) request(deal, stage)
        }}
      >
        {options.length === 0 && (
          <NativeSelectOption value={deal.stage.id}>{deal.stage.name}</NativeSelectOption>
        )}
        {options.map((stage) => (
          <NativeSelectOption key={stage.id} value={stage.id}>
            {stage.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {dialog}
    </div>
  )
}
