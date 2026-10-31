import { useTranslation } from 'react-i18next'

import type { MailThreadSummary } from '@/shared/api/generated/model'
import { Badge } from '@/shared/ui/badge'

/**
 * What the AI made of a conversation: its category, and whether a person has corrected
 * it ("Ispravio korisnik", with no confidence: there is none) or it is below the review
 * threshold ("Za pregled", as the API says: `needsReview`). Only for plans with the AI.
 */
export function ThreadCategoryBadge({
  thread,
}: {
  thread: Pick<MailThreadSummary, 'classification' | 'needsReview'>
}) {
  const { t } = useTranslation()
  const classification = thread.classification
  if (!classification) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={classification.isSales ? 'secondary' : 'outline'}>
        {t(`sales.category.${classification.category}`)}
      </Badge>
      {classification.source === 'user' && (
        <Badge variant="outline">{t('sales.classify.byUser')}</Badge>
      )}
      {thread.needsReview && <Badge variant="destructive">{t('sales.classify.needsReview')}</Badge>}
    </span>
  )
}
