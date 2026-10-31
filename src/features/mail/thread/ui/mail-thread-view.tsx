import { Link } from '@tanstack/react-router'
import { PaperclipIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type MailAddress,
  type MailAttachment,
  type MailMessage,
  type MailThread,
  useGetMailThread,
} from '@/entities/mail-thread'
import { isClientError } from '@/shared/api/api-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

const names = (people: readonly MailAddress[]) =>
  people
    .map((person) => (person.name ? `${person.name} <${person.email}>` : person.email))
    .join(', ')

const sizeText = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} kB`

/**
 * One conversation: its subject, the mailboxes it is in, the deal it belongs to and the
 * messages the API returns (oldest first). Message text is shown as text, never as HTML and
 * without turning anything into a link. What can be done with it is the caller's: `actions`
 * and `aside` get the loaded thread, `attachmentAction` gets an attachment.
 */
export function MailThreadView({
  threadId,
  onClose,
  actions,
  aside,
  attachmentAction,
}: {
  threadId: string
  onClose?: () => void
  actions?: (thread: MailThread) => ReactNode
  aside?: (thread: MailThread) => ReactNode
  attachmentAction?: (
    thread: MailThread,
    message: MailMessage,
    attachment: MailAttachment,
  ) => ReactNode
}) {
  const { t } = useTranslation()
  const query = useGetMailThread(threadId)

  if (query.isError) {
    const gone = isClientError(query.error) && query.error.status === 404
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {gone ? t('sales.thread.notFound') : t('sales.thread.loadFailed')}
        </AlertDescription>
        <AlertAction>
          {gone ? (
            onClose && (
              <Button size="sm" variant="outline" onClick={onClose}>
                {t('sales.thread.close')}
              </Button>
            )
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void query.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          )}
        </AlertAction>
      </Alert>
    )
  }
  if (!query.data) {
    return (
      <div aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  const thread = query.data
  return (
    <article aria-label={thread.subject} className="min-w-0 space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold break-words">{thread.subject}</h2>
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('sales.thread.close')}
              onClick={onClose}
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
        <ul
          aria-label={t('sales.thread.mailboxes')}
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          {thread.mailboxes.map((mailbox) => (
            <li key={mailbox.id}>
              <Badge variant="outline">
                {mailbox.emailAddress} ({t(`sales.thread.mailboxKind.${mailbox.kind}`)})
              </Badge>
            </li>
          ))}
        </ul>
        {(thread.deal ?? thread.client) && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {thread.deal && (
              <Link
                to="/sales/deals/$id"
                params={{ id: thread.deal.id }}
                className="font-medium underline-offset-2 hover:underline"
              >
                {t('sales.inbox.deal', { title: thread.deal.title })}
              </Link>
            )}
            {thread.client && (
              <Link
                to="/clients/$clientId"
                params={{ clientId: thread.client.id }}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                {t('sales.thread.client', { name: thread.client.name })}
              </Link>
            )}
          </p>
        )}
        {actions?.(thread)}
      </header>
      {aside?.(thread)}
      <p className="text-xs text-muted-foreground">{t('sales.thread.onlyVisible')}</p>
      {thread.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sales.thread.noMessages')}</p>
      ) : (
        <ol className="space-y-3">
          {thread.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              renderAttachment={(attachment) => attachmentAction?.(thread, message, attachment)}
            />
          ))}
        </ol>
      )}
    </article>
  )
}

function MessageCard({
  message,
  renderAttachment,
}: {
  message: MailMessage
  renderAttachment: (attachment: MailAttachment) => ReactNode
}) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  return (
    <li
      data-testid="thread-message"
      className="space-y-2 rounded-lg border p-3 text-sm data-[direction=outbound]:bg-muted/40"
      data-direction={message.direction}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {t('sales.thread.from', { name: message.from.name ?? message.from.email })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(`sales.thread.${message.direction}`)}, {formatRelativeDateTime(message.sentAt)}
        </span>
      </div>
      <p className="text-xs break-words text-muted-foreground">
        {t('sales.thread.to', { names: names(message.to) })}
        {message.cc && message.cc.length > 0
          ? ` · ${t('sales.thread.cc', { names: names(message.cc) })}`
          : ''}
      </p>
      {message.bodyText === null || message.bodyText === undefined ? (
        <div className="space-y-1">
          <p className="break-words">{message.snippet}</p>
          <p className="text-xs text-muted-foreground">
            <strong>{t('sales.thread.noBody')}</strong> {t('sales.thread.noBodyWhy')}
          </p>
        </div>
      ) : (
        // Plain text: shown as text (line breaks kept), never parsed as HTML
        <p className="break-words whitespace-pre-wrap">{message.bodyText}</p>
      )}
      {message.attachments.length > 0 && (
        <ul aria-label={t('sales.thread.attachments')} className="space-y-1 border-t pt-2">
          {message.attachments.map((attachment) => (
            <li key={attachment.partId} className="flex flex-wrap items-center gap-2">
              <PaperclipIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {attachment.fileName}{' '}
                <span className="text-xs text-muted-foreground">
                  ({sizeText(attachment.sizeBytes)})
                </span>
              </span>
              {renderAttachment(attachment)}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
