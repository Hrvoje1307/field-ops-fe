import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type MailAttachment,
  type MailMessage,
  type MailThread,
  useSaveThreadAttachment,
} from '@/entities/mail-thread'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Button } from '@/shared/ui/button'

/**
 * Saves a mail attachment to the deal the conversation is linked to (the server fetches
 * it from the mail provider; the browser never downloads it). Without a deal it is off and
 * says why. Once saved it is marked and links to the deal's files.
 */
export function SaveAttachmentButton({
  thread,
  message,
  attachment,
}: {
  thread: MailThread
  message: MailMessage
  attachment: MailAttachment
}) {
  const { t } = useTranslation()
  const save = useSaveThreadAttachment()
  if (attachment.savedAttachmentId) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="font-medium">{t('sales.attach.saved')}</span>
        {thread.deal && (
          <Link
            to="/sales/deals/$id"
            params={{ id: thread.deal.id }}
            className="underline-offset-2 hover:underline"
          >
            {t('sales.attach.openFiles')}
          </Link>
        )}
      </span>
    )
  }
  if (!thread.deal) {
    return (
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button size="sm" variant="outline" disabled aria-describedby={`why-${attachment.partId}`}>
          {t('sales.attach.save')}
        </Button>
        <span id={`why-${attachment.partId}`}>{t('sales.attach.notLinked')}</span>
      </span>
    )
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={save.isPending}
      aria-label={t('sales.attach.saveFor', { name: attachment.fileName })}
      onClick={() => {
        save.mutate(
          { id: thread.id, body: { messageId: message.id, partId: attachment.partId } },
          {
            onSuccess: () => {
              toast.success(t('sales.attach.done'))
            },
            onError: (error) => {
              toast.error(
                salesErrorCode(error) ? salesErrorMessage(error) : t('sales.attach.failed'),
              )
            },
          },
        )
      }}
    >
      {save.isPending ? t('sales.attach.saving') : t('sales.attach.save')}
    </Button>
  )
}
