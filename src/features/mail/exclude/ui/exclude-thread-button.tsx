import { BanIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  domainOf,
  type ExcludeScope,
  externalSender,
  type MailThread,
  toExcludeBody,
  useExcludeMailThread,
} from '@/entities/mail-thread'
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
 * "Isključi pošiljatelja": a rule for this address or for the whole domain, with a clear
 * choice about deleting what is stored. Both choices are always sent; nothing relies on the
 * API's defaults, and no list of "public" domains is kept here.
 */
export function ExcludeThreadButton({ thread }: { thread: MailThread }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const sender = externalSender(thread)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!sender}
        title={sender ? undefined : t('sales.exclude.noSender')}
        onClick={() => {
          setOpen(true)
        }}
      >
        <BanIcon aria-hidden="true" />
        {t('sales.exclude.open')}
      </Button>
      {open && sender && (
        <ExcludeDialog
          threadId={thread.id}
          email={sender.email}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function ExcludeDialog({
  threadId,
  email,
  onClose,
}: {
  threadId: string
  email: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const exclude = useExcludeMailThread()
  const [scope, setScope] = useState<ExcludeScope>('address')
  const [purge, setPurge] = useState(true)
  const domain = domainOf(email)
  const error = exclude.isError
    ? salesErrorCode(exclude.error)
      ? salesErrorMessage(exclude.error)
      : t('sales.exclude.failed')
    : null

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !exclude.isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sales.exclude.title')}</DialogTitle>
          <DialogDescription>{t('sales.exclude.description')}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('sales.exclude.scope')}</legend>
          {(['address', 'domain'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${id}-scope`}
                className="accent-primary"
                checked={scope === value}
                onChange={() => {
                  setScope(value)
                }}
              />
              {value === 'address'
                ? t('sales.exclude.address', { email })
                : t('sales.exclude.domain', { domain })}
            </label>
          ))}
          {scope === 'domain' && (
            <Alert>
              <AlertDescription>{t('sales.exclude.domainWarning', { domain })}</AlertDescription>
            </Alert>
          )}
        </fieldset>
        <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox
            id={`${id}-purge`}
            checked={purge}
            onCheckedChange={(checked) => {
              setPurge(checked === true)
            }}
          />
          <div className="space-y-1">
            <Label htmlFor={`${id}-purge`}>{t('sales.exclude.purge')}</Label>
            <p className="text-muted-foreground">
              {purge ? t('sales.exclude.purgeOn') : t('sales.exclude.purgeOff')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={exclude.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={exclude.isPending}
            onClick={() => {
              exclude.mutate(
                { id: threadId, body: toExcludeBody(scope, email, purge) },
                {
                  onSuccess: (rule) => {
                    toast.success(t('sales.exclude.done', { pattern: rule.pattern }))
                    onClose()
                  },
                },
              )
            }}
          >
            {t('sales.exclude.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
