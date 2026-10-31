import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  ALL_CATEGORIES,
  isSalesCategory,
  type MailThread,
  type ThreadCategory,
  ThreadCategoryBadge,
  useReprocessMailThread,
  useUpdateThreadClassification,
} from '@/entities/mail-thread'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/**
 * What the AI made of the conversation, and the person's say: one click for the category,
 * a switch for "sales / not sales" (both fields are always sent, as the API asks), and
 * "Ponovno obradi". Only for plans with `sales_ai` (the caller decides). The suggested stage
 * is a suggestion: `suggestedStage` renders what a person may do with it.
 */
export function ClassificationCard({
  thread,
  suggestedStage,
}: {
  thread: MailThread
  /** What to offer for the AI's suggested stage (nothing is moved here). */
  suggestedStage?: (stageId: string) => ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  const update = useUpdateThreadClassification()
  const reprocess = useReprocessMailThread()
  const classification = thread.classification

  const fail = (error: unknown, fallback: string) => {
    toast.error(salesErrorCode(error) ? salesErrorMessage(error) : fallback)
  }
  function correct(category: ThreadCategory, isSales: boolean) {
    update.mutate(
      { id: thread.id, body: { category, isSales } },
      {
        onSuccess: () => {
          toast.success(t('sales.classify.saved'))
        },
        onError: (error) => {
          fail(error, t('sales.classify.saveFailed'))
        },
      },
    )
  }

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="font-semibold">
          {t('sales.classify.title')}
        </h3>
        <div className="flex items-center gap-2">
          <ThreadCategoryBadge thread={thread} />
          <Button
            size="sm"
            variant="outline"
            disabled={reprocess.isPending || thread.aiStatus === 'pending'}
            onClick={() => {
              reprocess.mutate(thread.id, {
                onSuccess: () => {
                  toast.success(t('sales.classify.reprocessQueued'))
                },
                onError: (error) => {
                  fail(error, t('sales.classify.reprocessFailed'))
                },
              })
            }}
          >
            {t('sales.classify.reprocess')}
          </Button>
        </div>
      </div>

      {thread.aiStatus === 'pending' && (
        <p role="status" className="text-muted-foreground">
          {t('sales.classify.pending')}
        </p>
      )}
      {thread.aiStatus === 'failed' && (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.classify.failed')}</AlertDescription>
        </Alert>
      )}
      {thread.aiStatus === 'skipped' && (
        <p className="text-muted-foreground">{t('sales.classify.skipped')}</p>
      )}

      {classification ? (
        <>
          {classification.source === 'ai' && classification.confidence != null && (
            <p className="text-xs text-muted-foreground">
              {t('sales.classify.confidence', {
                value: `${String(Math.round(classification.confidence * 100))} %`,
              })}
            </p>
          )}
          {classification.summary && (
            <div>
              <p className="font-medium">{t('sales.classify.summary')}</p>
              <p>{classification.summary}</p>
            </div>
          )}
          {classification.nextAction && (
            <div>
              <p className="font-medium">{t('sales.classify.nextAction')}</p>
              <p>{classification.nextAction}</p>
            </div>
          )}
          {classification.suggestedStageId && suggestedStage?.(classification.suggestedStageId)}

          <div
            role="group"
            aria-label={t('sales.classify.category')}
            className="flex flex-wrap gap-1"
          >
            {ALL_CATEGORIES.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={classification.category === category ? 'default' : 'outline'}
                aria-pressed={classification.category === category}
                disabled={update.isPending}
                onClick={() => {
                  // The category settles whether it is a sales conversation, as the contract defines them
                  correct(category, isSalesCategory(category))
                }}
              >
                {t(`sales.category.${category}`)}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label={t('sales.classify.switchLabel')}
            className="inline-flex rounded-lg border p-0.5"
          >
            {[true, false].map((value) => (
              <Button
                key={String(value)}
                size="sm"
                variant={classification.isSales === value ? 'default' : 'ghost'}
                aria-pressed={classification.isSales === value}
                disabled={update.isPending}
                onClick={() => {
                  if (classification.isSales !== value) correct(classification.category, value)
                }}
              >
                {t(value ? 'sales.classify.salesOn' : 'sales.classify.salesOff')}
              </Button>
            ))}
          </div>
        </>
      ) : (
        thread.aiStatus === 'done' && (
          <p className="text-muted-foreground">{t('sales.classify.none')}</p>
        )
      )}
    </section>
  )
}
