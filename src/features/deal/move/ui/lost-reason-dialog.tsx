import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LostReason } from '@/entities/deal'
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
import { Field, FieldError, FieldLabel } from '@/shared/ui/field'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Textarea } from '@/shared/ui/textarea'

const REASONS = Object.values(LostReason)

/**
 * Asked before a deal goes to a lost stage: the reason is required (the API answers 400
 * `lostReason` without it, and that message shows next to the field too). Closing it
 * without confirming sends nothing.
 */
export function LostReasonDialog({
  dealTitle,
  stageName,
  pending,
  reasonError,
  failure,
  onConfirm,
  onCancel,
}: {
  dealTitle: string
  stageName: string
  pending: boolean
  /** The server's message about the reason field. */
  reasonError: string | null
  /** Any other failure of the move. */
  failure: string | null
  onConfirm: (reason: LostReason, note: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [reason, setReason] = useState<LostReason | ''>('')
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState(false)
  const error = missing ? t('sales.lost.reasonRequired') : reasonError

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason) {
              setMissing(true)
              return
            }
            onConfirm(reason, note.trim())
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('sales.lost.title')}</DialogTitle>
            <DialogDescription>
              {t('sales.lost.description', { title: dealTitle, stage: stageName })}
            </DialogDescription>
          </DialogHeader>
          {failure && (
            <Alert role="alert" variant="destructive">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={`${id}-reason`}>{t('sales.lost.reason')}</FieldLabel>
            <NativeSelect
              id={`${id}-reason`}
              className="w-full"
              value={reason}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(event) => {
                setReason(event.target.value as LostReason | '')
                setMissing(false)
              }}
            >
              <NativeSelectOption value="">{t('sales.lost.chooseReason')}</NativeSelectOption>
              {REASONS.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {t(`sales.lostReason.${value}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>{t('sales.lost.note')}</FieldLabel>
            <Textarea
              id={`${id}-note`}
              rows={3}
              value={note}
              onChange={(event) => {
                setNote(event.target.value)
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {t('sales.lost.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
