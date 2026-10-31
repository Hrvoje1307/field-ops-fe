import { SendIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type Draft,
  formatAddresses,
  useDiscardDraft,
  useSaveDraftToMailbox,
  useSendDraft,
} from '@/entities/draft'
import type { MailAddress } from '@/entities/mail-thread'
import { isConflict } from '@/shared/api/api-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

/** What the editor hands over (the editor's own context has these and more). */
export interface DraftActionsContext {
  draft: Draft
  mailbox: { emailAddress: string; canSend: boolean } | undefined
  dirty: boolean
  current: () => { subject: string; to: MailAddress[]; cc: MailAddress[] }
  flush: () => Promise<Draft | null>
  keepEdits: () => void
}

/**
 * Send, save to the mailbox, discard. Sending is only ever a person's action and asks first,
 * naming everyone it goes to, the mailbox and the subject. Unsaved edits are saved before
 * anything else, and what is sent is the version just saved: if the save fails nothing is sent.
 */
export function DraftActions({ context }: { context: DraftActionsContext }) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<'send' | 'discard' | null>(null)
  const save = useSaveDraftToMailbox()
  const canSend = context.mailbox?.canSend === true
  const saved = context.draft.status === 'saved_to_mailbox'

  const fail = (error: unknown, fallback: string) => {
    toast.error(salesErrorCode(error) ? salesErrorMessage(error) : fallback)
  }

  async function saveToMailbox() {
    const latest = await context.flush()
    if (!latest) return
    save.mutate(latest.id, {
      onSuccess: () => {
        toast.success(t('sales.draft.savedToMailbox'))
      },
      onError: (error) => {
        if (isConflict(error)) context.keepEdits()
        fail(error, t('sales.draft.saveToMailboxFailed'))
      },
    })
  }

  return (
    <>
      <Button
        size="sm"
        disabled={!canSend}
        onClick={() => {
          setDialog('send')
        }}
      >
        <SendIcon aria-hidden="true" />
        {t('sales.draft.send')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!canSend || save.isPending}
        onClick={() => void saveToMailbox()}
      >
        {save.isPending ? t('sales.draft.savingToMailbox') : t('sales.draft.saveToMailbox')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setDialog('discard')
        }}
      >
        <Trash2Icon aria-hidden="true" />
        {t('sales.draft.discard')}
      </Button>
      {!canSend && (
        <p className="w-full text-xs text-muted-foreground">{t('sales.draft.cannotSend')}</p>
      )}
      {dialog === 'send' && (
        <SendDialog
          context={context}
          onClose={() => {
            setDialog(null)
          }}
        />
      )}
      <DiscardDialog
        draftId={context.draft.id}
        saved={saved}
        open={dialog === 'discard'}
        onClose={() => {
          setDialog(null)
        }}
      />
    </>
  )
}

function SendDialog({ context, onClose }: { context: DraftActionsContext; onClose: () => void }) {
  const { t } = useTranslation()
  const send = useSendDraft()
  const [failure, setFailure] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  // What the form says now is what will go out (after it is saved)
  const now = context.current()

  async function confirm() {
    setFailure(null)
    setWorking(true)
    try {
      // Saved first, and the saved version is the one that is sent
      const latest = await context.flush()
      if (!latest) {
        // Nothing is sent. Why is in the editor (field errors, or the warning about a newer
        // version), which the open dialog would hide
        onClose()
        return
      }
      await send.mutateAsync({ id: latest.id, body: { version: latest.version } })
      toast.success(t('sales.draft.sent'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        // The newest draft is shown; the text typed here stays in the editor
        context.keepEdits()
        toast.error(salesErrorCode(error) ? salesErrorMessage(error) : t('sales.draft.sendFailed'))
        onClose()
        return
      }
      setFailure(salesErrorCode(error) ? salesErrorMessage(error) : t('sales.draft.sendFailed'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sales.draft.sendTitle')}</DialogTitle>
          <DialogDescription>{t('sales.draft.sendDescription')}</DialogDescription>
        </DialogHeader>
        {failure && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
        <dl className="space-y-2 text-sm">
          <Row label={t('sales.draft.sendFrom')}>{context.mailbox?.emailAddress ?? ''}</Row>
          <Row label={t('sales.draft.sendTo')}>{formatAddresses(now.to)}</Row>
          {now.cc.length > 0 && (
            <Row label={t('sales.draft.sendCc')}>{formatAddresses(now.cc)}</Row>
          )}
          <Row label={t('sales.draft.sendSubject')}>{now.subject}</Row>
        </dl>
        {context.dirty && (
          <p className="text-xs text-muted-foreground">{t('sales.draft.sendChanges')}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={working} onClick={() => void confirm()}>
            {working ? t('sales.draft.sending') : t('sales.draft.sendConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  )
}

function DiscardDialog({
  draftId,
  saved,
  open,
  onClose,
}: {
  draftId: string
  saved: boolean
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const discard = useDiscardDraft()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          discard.reset()
          onClose()
        }
      }}
      title={t('sales.draft.discardTitle')}
      description={
        saved ? t('sales.draft.discardDescriptionSaved') : t('sales.draft.discardDescription')
      }
      confirmLabel={t('sales.draft.discard')}
      pending={discard.isPending}
      error={
        discard.isError
          ? salesErrorCode(discard.error)
            ? salesErrorMessage(discard.error)
            : t('sales.draft.discardFailed')
          : null
      }
      onConfirm={() => {
        // (the editor goes away with the draft, so the answer is awaited here, not in `mutate`)
        void discard.mutateAsync(draftId).then(
          () => {
            toast.success(t('sales.draft.discarded'))
            onClose()
          },
          () => undefined,
        )
      }}
    />
  )
}
