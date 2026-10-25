import { SendIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type Message, MessageStatusBadge, useListMessages } from '@/entities/message'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import { SendMessageSheet } from './send-message-sheet'

/** What the client has been sent about this job, and a way to send them something. */
export function JobMessages({ jobId }: { jobId: string }) {
  const { t } = useTranslation()
  const messages = useListMessages({ jobId, pageSize: 50 })
  const [sending, setSending] = useState(false)

  return (
    <section aria-label={t('job.messages.title')} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('job.messages.title')}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSending(true)
          }}
        >
          <SendIcon aria-hidden="true" />
          {t('job.messages.send')}
        </Button>
      </div>
      {messages.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('job.messages.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void messages.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !messages.data ? (
        <Skeleton className="h-20" />
      ) : messages.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('job.messages.empty')}</p>
      ) : (
        <ul aria-label={t('job.messages.list')} className="divide-y rounded-lg border">
          {messages.data.items.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}
        </ul>
      )}
      {sending && (
        <SendMessageSheet
          jobId={jobId}
          onClose={() => {
            setSending(false)
          }}
        />
      )}
    </section>
  )
}

function MessageRow({ message }: { message: Message }) {
  const { t } = useTranslation()
  const { formatRelativeDateTime, formatMoney } = useTenantFormat()
  return (
    <li className="p-3" data-testid="job-message">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
          <MessageStatusBadge status={message.status} />
          <span className="font-medium">{t(`settings.messages.channels.${message.channel}`)}</span>
          <span className="text-muted-foreground">{message.to}</span>
          <span className="ml-auto text-muted-foreground">
            {formatRelativeDateTime(message.createdAt)}
          </span>
        </summary>
        <div className="mt-2 space-y-1 text-sm">
          {message.subject && <p className="font-medium">{message.subject}</p>}
          <p className="whitespace-pre-wrap">{message.body}</p>
          {message.error && <p className="text-destructive">{message.error}</p>}
          {message.channel === 'sms' &&
            message.segments !== null &&
            message.segments !== undefined && (
              <p className="text-muted-foreground">
                {t('message.preview.segments', { count: message.segments })}
                {message.cost ? ` · ${formatMoney(message.cost)}` : ''}
              </p>
            )}
        </div>
      </details>
    </li>
  )
}
