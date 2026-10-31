import { useTranslation } from 'react-i18next'

import { useSalesAccess } from '@/entities/auth'
import { useGetDeal } from '@/entities/deal'
import { useListSalesStages } from '@/entities/sales-stage'
import { useDealMove } from '@/features/deal/move'
import { ClassificationCard } from '@/features/mail/classify'
import { ExcludeThreadButton } from '@/features/mail/exclude'
import { ThreadDealLink } from '@/features/mail/link'
import { SaveAttachmentButton } from '@/features/mail/save-attachment'
import { MailThreadView } from '@/features/mail/thread'
import { Button } from '@/shared/ui/button'

/**
 * One conversation with what can be done with it: link it to a deal or make a deal from
 * it, exclude the sender, save attachments to the deal, and (with `sales_ai`) read and
 * correct what the AI made of it. The AI only suggests: moving the deal to the suggested
 * stage is a button a person presses. `onWon` is told when that move lands in a won stage.
 */
export function MailThreadPanel({
  threadId,
  onClose,
  onWon,
}: {
  threadId: string
  onClose?: () => void
  onWon: (dealId: string, title: string) => void
}) {
  const { hasAi } = useSalesAccess()
  return (
    <MailThreadView
      threadId={threadId}
      onClose={onClose}
      actions={(thread) => (
        <div className="flex flex-wrap gap-2">
          <ThreadDealLink thread={thread} />
          <ExcludeThreadButton thread={thread} />
        </div>
      )}
      aside={
        hasAi
          ? (thread) => (
              <ClassificationCard
                thread={thread}
                suggestedStage={(stageId) => (
                  <SuggestedStage stageId={stageId} deal={thread.deal ?? null} onWon={onWon} />
                )}
              />
            )
          : undefined
      }
      attachmentAction={(thread, message, attachment) => (
        <SaveAttachmentButton thread={thread} message={message} attachment={attachment} />
      )}
    />
  )
}

/** The AI's suggested stage. Moving is offered only for a linked deal and is the person's action. */
function SuggestedStage({
  stageId,
  deal,
  onWon,
}: {
  stageId: string
  deal: { id: string; title: string } | null
  onWon: (dealId: string, title: string) => void
}) {
  const { t } = useTranslation()
  const stages = useListSalesStages()
  const detail = useGetDeal(deal?.id ?? '', { enabled: deal !== null })
  const { request, dialog, pending } = useDealMove({
    onWon: (won) => {
      onWon(won.id, won.title)
    },
  })
  const stage = stages.data?.find((candidate) => candidate.id === stageId)
  if (!stage) return null
  const already = detail.data?.stage.id === stage.id
  return (
    <div className="space-y-1">
      <p className="font-medium">{t('sales.classify.suggestedStage', { stage: stage.name })}</p>
      <p className="text-xs text-muted-foreground">{t('sales.classify.suggestedHint')}</p>
      {deal && detail.data && !already && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            request(
              { id: detail.data.id, title: detail.data.title, version: detail.data.version },
              stage,
            )
          }}
        >
          {t('sales.classify.moveTo', { stage: stage.name })}
        </Button>
      )}
      {dialog}
    </div>
  )
}
