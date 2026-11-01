import { ArrowLeftIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MailboxAttention } from '@/features/mailbox/attention'
import { type InboxSearch, type InboxSearchChange, MailInbox } from '@/features/mail/inbox'
import { Button } from '@/shared/ui/button'
import { ConvertDealSheet, ConvertOffer } from '@/widgets/deal-convert'
import { MailThreadPanel } from '@/widgets/mail-thread'

export function SalesInboxPage({
  search,
  onSearchChange,
}: {
  search: InboxSearch
  onSearchChange: InboxSearchChange
}) {
  const { t } = useTranslation()
  const [offer, setOffer] = useState<{ id: string; title: string } | null>(null)
  const [converting, setConverting] = useState<string | null>(null)
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('sales.pages.inbox')}</h1>
      <MailboxAttention />
      {/* The conversations on the left, the open one (kept in the address) on the right; on a
          narrow screen the open conversation replaces the list */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={search.thread ? 'hidden lg:block' : undefined}>
          <MailInbox search={search} onSearchChange={onSearchChange} />
        </div>
        <div className={search.thread ? undefined : 'hidden lg:block'}>
          {search.thread ? (
            <div className="space-y-3">
              {/* On a phone the conversation replaces the list; the browser's Back does the same */}
              <Button
                variant="ghost"
                className="h-11 lg:hidden"
                onClick={() => {
                  onSearchChange({ thread: undefined })
                }}
              >
                <ArrowLeftIcon aria-hidden="true" />
                {t('sales.inbox.backToList')}
              </Button>
              <MailThreadPanel
                key={search.thread}
                threadId={search.thread}
                onWon={(id, title) => {
                  setOffer({ id, title })
                }}
                onClose={() => {
                  onSearchChange({ thread: undefined })
                }}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('sales.inbox.pickOne')}
            </p>
          )}
        </div>
      </div>
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
