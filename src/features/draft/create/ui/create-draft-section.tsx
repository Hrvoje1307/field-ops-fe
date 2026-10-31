import { SparklesIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSalesAccess } from '@/entities/auth'
import {
  type DraftKind,
  INSTRUCTIONS_MAX,
  sendingMailboxes,
  useCreateDraft,
} from '@/entities/draft'
import type { MailThread } from '@/entities/mail-thread'
import { useGetSalesSettings } from '@/entities/sales-config'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Textarea } from '@/shared/ui/textarea'

const KINDS: readonly DraftKind[] = ['reply', 'follow_up']

/**
 * "Pripremi nacrt": a draft is only ever written by the AI (the API has no other way), so
 * without `sales_ai` or with the AI switched off in the settings there is no button and the
 * conversation says to answer from one's own mail. A mailbox that cannot send cannot have a
 * draft either (409 `mailbox.cannot_send`), and the form says so.
 */
export function CreateDraftSection({ thread }: { thread: MailThread }) {
  const { t } = useTranslation()
  const { hasAi } = useSalesAccess()
  const settings = useGetSalesSettings()
  const [open, setOpen] = useState(false)

  if (!hasAi) return <p className="text-sm text-muted-foreground">{t('sales.draft.noAi')}</p>
  if (settings.data?.aiEnabled === false) {
    return <p className="text-sm text-muted-foreground">{t('sales.draft.noAiDisabled')}</p>
  }
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpen(true)
        }}
      >
        <SparklesIcon aria-hidden="true" />
        {t('sales.draft.create')}
      </Button>
      {open && (
        <CreateDraftDialog
          thread={thread}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function CreateDraftDialog({ thread, onClose }: { thread: MailThread; onClose: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const create = useCreateDraft()
  const senders = useMemo(() => sendingMailboxes(thread.mailboxes), [thread.mailboxes])
  // The thread's own mailbox when it can send, else the first that can
  const initial = senders.find((mailbox) => mailbox.id === thread.mailbox.id) ?? senders[0]
  const [kind, setKind] = useState<DraftKind>(thread.awaitingReply ? 'reply' : 'follow_up')
  const [instructions, setInstructions] = useState('')
  const [mailboxId, setMailboxId] = useState(initial?.id ?? '')
  const error = create.isError
    ? salesErrorCode(create.error)
      ? salesErrorMessage(create.error)
      : t('sales.draft.createFailed')
    : null

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !create.isPending) onClose()
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate(
              {
                threadId: thread.id,
                body: {
                  kind,
                  ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
                  ...(mailboxId ? { mailboxId } : {}),
                },
              },
              {
                onSuccess: () => {
                  toast.success(t('sales.draft.created'))
                  onClose()
                },
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('sales.draft.createTitle')}</DialogTitle>
            <DialogDescription>{t('sales.draft.createDescription')}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {senders.length === 0 ? (
            <Alert role="alert">
              <AlertDescription>{t('sales.draft.noSendingMailbox')}</AlertDescription>
            </Alert>
          ) : (
            <>
              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">{t('sales.draft.kindLabel')}</legend>
                <div className="flex gap-4">
                  {KINDS.map((value) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`${id}-kind`}
                        className="accent-primary"
                        checked={kind === value}
                        onChange={() => {
                          setKind(value)
                        }}
                      />
                      {t(`sales.draft.kind.${value}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-1">
                <Label htmlFor={`${id}-instructions`}>{t('sales.draft.instructions')}</Label>
                <Textarea
                  id={`${id}-instructions`}
                  rows={4}
                  maxLength={INSTRUCTIONS_MAX}
                  value={instructions}
                  aria-describedby={`${id}-hint`}
                  onChange={(event) => {
                    setInstructions(event.target.value)
                  }}
                />
                <p id={`${id}-hint`} className="flex justify-between text-xs text-muted-foreground">
                  <span>{t('sales.draft.instructionsHint')}</span>
                  <span>
                    {t('sales.draft.instructionsCount', {
                      count: instructions.length,
                      max: INSTRUCTIONS_MAX,
                    })}
                  </span>
                </p>
              </div>
              {senders.length > 1 && (
                <div className="space-y-1">
                  <Label htmlFor={`${id}-mailbox`}>{t('sales.draft.mailbox')}</Label>
                  <NativeSelect
                    id={`${id}-mailbox`}
                    className="w-full"
                    value={mailboxId}
                    onChange={(event) => {
                      setMailboxId(event.target.value)
                    }}
                  >
                    {senders.map((mailbox) => (
                      <NativeSelectOption key={mailbox.id} value={mailbox.id}>
                        {mailbox.emailAddress}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending || senders.length === 0}>
              {create.isPending ? t('sales.draft.creating') : t('sales.draft.createConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
