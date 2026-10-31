import { PauseIcon, PencilIcon, PlayIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  isOAuthMailbox,
  type Mailbox,
  MailboxStatusBadge,
  toMailboxUpdate,
  toReconnectBody,
  useListMailboxes,
  useStartMailboxOAuth,
  useSyncMailbox,
  useUpdateMailbox,
} from '@/entities/mailbox'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfigList, ConfigListItem } from '@/shared/ui/config-list'
import { Skeleton } from '@/shared/ui/skeleton'

import { DisconnectMailboxDialog } from './disconnect-dialog'
import { EditMailboxSheet } from './edit-mailbox-sheet'

/**
 * The tenant's mailboxes with their status, last sync and what can be done: sync now,
 * reconnect (a Gmail or Microsoft mailbox through the provider, an IMAP one through the
 * form the screen shows), pause, edit, disconnect.
 */
export function MailboxList({
  onReconnectImap,
  empty,
}: {
  onReconnectImap: (mailbox: Mailbox) => void
  /** Said, with what to do about it, when there is no mailbox. */
  empty: ReactNode
}) {
  const { t } = useTranslation()
  const mailboxes = useListMailboxes()
  const [editing, setEditing] = useState<Mailbox | null>(null)
  const [disconnecting, setDisconnecting] = useState<Mailbox | null>(null)

  if (mailboxes.isError && !mailboxes.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('sales.mailboxes.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void mailboxes.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (!mailboxes.data) return <Skeleton className="h-40" />
  if (mailboxes.data.length === 0) return <>{empty}</>
  return (
    <>
      <ConfigList label={t('sales.mailboxes.list')}>
        {mailboxes.data.map((mailbox) => (
          <MailboxRow
            key={mailbox.id}
            mailbox={mailbox}
            onEdit={() => {
              setEditing(mailbox)
            }}
            onDisconnect={() => {
              setDisconnecting(mailbox)
            }}
            onReconnectImap={() => {
              onReconnectImap(mailbox)
            }}
          />
        ))}
      </ConfigList>
      {editing && (
        <EditMailboxSheet
          mailbox={editing}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
      {disconnecting && (
        <DisconnectMailboxDialog
          mailbox={disconnecting}
          onClose={() => {
            setDisconnecting(null)
          }}
        />
      )}
    </>
  )
}

function MailboxRow({
  mailbox,
  onEdit,
  onDisconnect,
  onReconnectImap,
}: {
  mailbox: Mailbox
  onEdit: () => void
  onDisconnect: () => void
  onReconnectImap: () => void
}) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const sync = useSyncMailbox()
  const update = useUpdateMailbox()
  const start = useStartMailboxOAuth()
  const needsReconnect = mailbox.status === 'needs_reauth' || mailbox.status === 'error'
  const paused = mailbox.status === 'disabled'

  function syncNow() {
    sync.mutate(mailbox.id, {
      onSuccess: () => {
        toast.success(t('sales.mailboxes.syncQueued'))
      },
      onError: (error) => {
        toast.error(
          salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.syncFailed'),
        )
      },
    })
  }

  function reconnect() {
    if (!isOAuthMailbox(mailbox)) {
      onReconnectImap()
      return
    }
    start.mutate(toReconnectBody(mailbox), {
      // The provider's page is outside the app: go there, it brings the browser back
      onSuccess: ({ authorizeUrl }) => {
        window.location.assign(authorizeUrl)
      },
      onError: (error) => {
        toast.error(
          salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.oauthStartFailed'),
        )
      },
    })
  }

  function setActive(isActive: boolean) {
    update.mutate(
      { id: mailbox.id, body: toMailboxUpdate(mailbox, { isActive }) },
      {
        onSuccess: () => {
          toast.success(t(isActive ? 'sales.mailboxes.resumed' : 'sales.mailboxes.paused'))
        },
        onError: (error) => {
          toast.error(
            salesErrorCode(error) ? salesErrorMessage(error) : t('sales.mailboxes.updateFailed'),
          )
        },
      },
    )
  }

  const lines = [
    mailbox.emailAddress,
    t(`sales.mailboxes.provider.${mailbox.provider}`),
    mailbox.kind === 'personal' && mailbox.owner
      ? t('sales.mailboxes.ownerOf', { name: mailbox.owner.fullName })
      : t(`sales.mailboxes.kind.${mailbox.kind}`),
    mailbox.lastSyncedAt
      ? t('sales.mailboxes.lastSynced', { when: formatRelativeDateTime(mailbox.lastSyncedAt) })
      : t('sales.mailboxes.neverSynced'),
  ]
  return (
    <ConfigListItem
      title={
        <span className="flex flex-wrap items-center gap-2">
          {mailbox.displayName}
          <MailboxStatusBadge status={mailbox.status} />
        </span>
      }
      meta={
        <span className="block space-y-0.5">
          <span className="block">{lines.join(', ')}</span>
          {mailbox.lastError && needsReconnect && (
            <span className="block text-destructive">
              {t('sales.mailboxes.lastError', { message: mailbox.lastError })}
            </span>
          )}
          {mailbox.canSend === false && (
            <span className="block">{t('sales.mailboxes.cannotSend')}</span>
          )}
        </span>
      }
      actions={
        <>
          {needsReconnect ? (
            <Button
              size="sm"
              disabled={start.isPending}
              aria-label={t('sales.mailboxes.reconnectFor', { name: mailbox.displayName })}
              onClick={reconnect}
            >
              {t('sales.mailboxes.reconnect')}
            </Button>
          ) : (
            !paused && (
              <Button
                size="sm"
                variant="outline"
                disabled={sync.isPending || mailbox.status === 'connecting'}
                aria-label={t('sales.mailboxes.syncNowFor', { name: mailbox.displayName })}
                onClick={syncNow}
              >
                <RefreshCwIcon aria-hidden="true" />
                {t('sales.mailboxes.syncNow')}
              </Button>
            )
          )}
          {(mailbox.status === 'active' || paused) && (
            <Button
              variant="ghost"
              size="icon"
              disabled={update.isPending}
              aria-label={`${t(paused ? 'sales.mailboxes.resume' : 'sales.mailboxes.pause')}: ${mailbox.displayName}`}
              onClick={() => {
                setActive(paused)
              }}
            >
              {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('sales.mailboxes.editFor', { name: mailbox.displayName })}
            onClick={onEdit}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('sales.mailboxes.disconnectFor', { name: mailbox.displayName })}
            onClick={onDisconnect}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </>
      }
    />
  )
}
