import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConnectMailboxButton, ImapMailboxSheet } from '@/features/mailbox/connect'
import { MailboxList } from '@/features/mailbox/list'
import { OAuthReturnNotice } from '@/features/mailbox/oauth-return'
import type { Mailbox } from '@/entities/mailbox'
import { ConfigListHeader } from '@/shared/ui/config-list'

/**
 * The mailboxes screen: what the browser brought back from a provider, the connected
 * mailboxes, and ways to connect one. A reconnect of an IMAP mailbox opens the same form
 * as connecting a new one (the list asks for it, the form is the connect feature's).
 */
export function MailboxesSettings({
  search,
  onClearSearch,
}: {
  search: { connected?: string | undefined; error?: string | undefined }
  onClearSearch: () => void
}) {
  const { t } = useTranslation()
  const [imap, setImap] = useState<Mailbox | 'new' | null>(null)
  const openImap = () => {
    setImap('new')
  }
  return (
    <section aria-label={t('sales.mailboxes.title')} className="max-w-3xl space-y-4">
      <ConfigListHeader
        title={t('sales.mailboxes.title')}
        description={t('sales.mailboxes.description')}
        action={<ConnectMailboxButton onImap={openImap} />}
      />
      <OAuthReturnNotice search={search} onClear={onClearSearch} />
      <MailboxList
        onReconnectImap={setImap}
        empty={
          <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
            <p className="font-medium">{t('sales.mailboxes.emptyTitle')}</p>
            <p className="mx-auto max-w-prose text-sm text-muted-foreground">
              {t('sales.mailboxes.emptyDescription')}
            </p>
            <div className="flex justify-center">
              <ConnectMailboxButton onImap={openImap} />
            </div>
          </div>
        }
      />
      {imap && (
        <ImapMailboxSheet
          mailbox={imap === 'new' ? undefined : imap}
          onClose={() => {
            setImap(null)
          }}
        />
      )}
    </section>
  )
}
