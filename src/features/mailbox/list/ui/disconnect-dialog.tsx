import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type Mailbox, useDeleteMailbox } from '@/entities/mailbox'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'

/**
 * Disconnecting: sync stops and the grant is revoked, deals stay. Deleting what was imported
 * (`purge`) is a separate choice and needs one more confirmation.
 */
export function DisconnectMailboxDialog({
  mailbox,
  onClose,
}: {
  mailbox: Mailbox
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const remove = useDeleteMailbox()
  const [purge, setPurge] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const error = remove.isError
    ? salesErrorCode(remove.error)
      ? salesErrorMessage(remove.error)
      : t('sales.mailboxes.disconnectFailed')
    : null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !remove.isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sales.mailboxes.disconnectTitle')}</DialogTitle>
          <DialogDescription>
            {mailbox.displayName} ({mailbox.emailAddress}).{' '}
            {t('sales.mailboxes.disconnectDescription')}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`${id}-purge`}
              checked={purge}
              onCheckedChange={(checked) => {
                setPurge(checked === true)
                setUnderstood(false)
              }}
            />
            <div className="space-y-1">
              <Label htmlFor={`${id}-purge`}>{t('sales.mailboxes.purgeOption')}</Label>
              <p className="text-muted-foreground">{t('sales.mailboxes.purgeDescription')}</p>
            </div>
          </div>
          {purge && (
            <div className="flex items-start gap-2">
              <Checkbox
                id={`${id}-understood`}
                checked={understood}
                onCheckedChange={(checked) => {
                  setUnderstood(checked === true)
                }}
              />
              <Label htmlFor={`${id}-understood`}>{t('sales.mailboxes.purgeConfirm')}</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending || (purge && !understood)}
            onClick={() => {
              remove.mutate(
                { id: mailbox.id, purge },
                {
                  onSuccess: () => {
                    toast.success(t('sales.mailboxes.disconnected'))
                    onClose()
                  },
                },
              )
            }}
          >
            {purge
              ? t('sales.mailboxes.disconnectPurgeConfirm')
              : t('sales.mailboxes.disconnectConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
