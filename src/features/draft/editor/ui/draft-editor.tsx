import { zodResolver } from '@hookform/resolvers/zod'
import { type ReactNode, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildDraftSchema,
  type Draft,
  draftFormValues,
  type DraftFormValues,
  hasChanges,
  parseAddresses,
  retryRequest,
  toDraftUpdate,
  useCreateDraft,
  useGetDraft,
  useUpdateDraft,
} from '@/entities/draft'
import type { MailAddress } from '@/entities/mail-thread'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

export interface ThreadMailbox {
  id: string
  emailAddress: string
  canSend: boolean
}

/** What the actions beside the editor get: the draft, where it is sent from, and the way to save edits first. */
export interface DraftEditorContext {
  draft: Draft
  /** The mailbox the draft is sent from, among the conversation's mailboxes the caller can see. */
  mailbox: ThreadMailbox | undefined
  /** There are edits that are not saved. */
  dirty: boolean
  /** What the form says right now (not necessarily saved). */
  current: () => { subject: string; to: MailAddress[]; cc: MailAddress[] }
  /**
   * Saves unsaved edits with the draft's latest version and gives back the saved draft, or
   * `null` when nothing was sent (the text is invalid or the save failed: the editor says
   * why and keeps everything typed). Nothing is saved when there is nothing new.
   */
  flush: () => Promise<Draft | null>
  /** A stale version was refused: keep the person's text and say so. */
  keepEdits: () => void
}

/**
 * The editor of one draft, by id. While the AI writes it the editor is locked ("Pripremam…")
 * and the draft is read again until it is not `generating`; a failed one says why and can be
 * tried again (a new draft with the same instructions). A draft that can be edited is a plain
 * text form; a refused save (409) keeps the typed text and warns. What to do with the draft
 * (send, save to the mailbox, discard) is `actions`.
 */
export function DraftEditor({
  draftId,
  threadId,
  mailboxes,
  actions,
}: {
  draftId: string
  threadId: string
  mailboxes: readonly ThreadMailbox[]
  actions: (context: DraftEditorContext) => ReactNode
}) {
  const { t } = useTranslation()
  const query = useGetDraft(draftId)
  const retry = useCreateDraft()
  const { formatRelativeDateTime } = useTenantFormat()

  if (query.isError && !query.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('sales.draft.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void query.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  const draft = query.data
  if (!draft) return <Skeleton className="h-40" />

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">
        {t('sales.draft.title')} ({t(`sales.draft.kind.${draft.kind}`)})
      </h3>
      <Badge variant={draft.status === 'failed' ? 'destructive' : 'secondary'}>
        {t(`sales.draft.status.${draft.status}`)}
      </Badge>
    </div>
  )

  if (draft.status === 'generating') {
    return (
      <section
        aria-label={t('sales.draft.title')}
        aria-busy="true"
        className="space-y-2 rounded-xl border p-3 text-sm"
      >
        {header}
        <p role="status" className="font-medium">
          {t('sales.draft.generating')}
        </p>
        <p className="text-muted-foreground">{t('sales.draft.generatingHint')}</p>
      </section>
    )
  }
  if (draft.status === 'failed') {
    return (
      <section
        aria-label={t('sales.draft.title')}
        className="space-y-2 rounded-xl border p-3 text-sm"
      >
        {header}
        <Alert variant="destructive">
          <AlertDescription>{draft.error ?? t('sales.draft.failed')}</AlertDescription>
        </Alert>
        <Button
          size="sm"
          disabled={retry.isPending}
          onClick={() => {
            retry.mutate(
              { threadId, body: retryRequest(draft) },
              {
                onSuccess: () => {
                  toast.success(t('sales.draft.retried'))
                },
                onError: (error) => {
                  toast.error(
                    salesErrorCode(error)
                      ? salesErrorMessage(error)
                      : t('sales.draft.createFailed'),
                  )
                },
              },
            )
          }}
        >
          {t('sales.draft.retry')}
        </Button>
      </section>
    )
  }
  if (draft.status === 'sent' || draft.status === 'discarded') {
    return (
      <section
        aria-label={t('sales.draft.title')}
        className="space-y-2 rounded-xl border p-3 text-sm"
      >
        {header}
        <p className="font-medium">{draft.subject}</p>
        <p className="break-words whitespace-pre-wrap">{draft.bodyText}</p>
        {draft.sentAt && (
          <p className="text-xs text-muted-foreground">
            {t('sales.draft.sentAt', { when: formatRelativeDateTime(draft.sentAt) })}.{' '}
            {t('sales.draft.sentNote')}
          </p>
        )}
      </section>
    )
  }
  return (
    <EditForm
      key={draft.id}
      draft={draft}
      header={header}
      mailbox={mailboxes.find((candidate) => candidate.id === draft.mailboxId)}
      actions={actions}
    />
  )
}

function EditForm({
  draft,
  header,
  mailbox,
  actions,
}: {
  draft: Draft
  header: ReactNode
  mailbox: ThreadMailbox | undefined
  actions: (context: DraftEditorContext) => ReactNode
}) {
  const { t } = useTranslation()
  const schema = useMemo(() => buildDraftSchema(), [])
  const form = useForm<DraftFormValues>({
    resolver: zodResolver(schema),
    defaultValues: draftFormValues(draft),
  })
  const update = useUpdateDraft()
  const [stale, setStale] = useState(false)
  const values = useWatch({ control: form.control })
  const dirty = hasChanges({ ...draftFormValues(draft), ...values }, draft)

  // What arrives from the server replaces the form only while there is nothing typed
  const adopt = useEffectEvent((next: Draft) => {
    if (!form.formState.isDirty) form.reset(draftFormValues(next))
  })
  useEffect(() => {
    adopt(draft)
  }, [draft])

  async function flush(): Promise<Draft | null> {
    // `draft` is the newest the screen has: a save never carries an older version
    const base = draft
    if (!hasChanges(form.getValues(), base)) return base
    if (!(await form.trigger())) return null
    try {
      const saved = await update.mutateAsync({
        id: base.id,
        body: toDraftUpdate(form.getValues(), base.version),
      })
      form.reset(draftFormValues(saved))
      setStale(false)
      return saved
    } catch (error) {
      if (isConflict(error)) setStale(true)
      else reportSaveError(error, form, t('sales.draft.saveFailed'))
      return null
    }
  }

  const current = () => {
    const v = form.getValues()
    return {
      subject: v.subject.trim(),
      to: parseAddresses(v.to).addresses,
      cc: parseAddresses(v.cc).addresses,
    }
  }

  return (
    <FormProvider {...form}>
      <section
        aria-label={t('sales.draft.title')}
        className="space-y-3 rounded-xl border p-3 text-sm"
      >
        {header}
        {stale && (
          <Alert role="alert">
            <AlertDescription>{t('sales.draft.staleKept')}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          {mailbox
            ? t('sales.draft.from', { mailbox: mailbox.emailAddress })
            : t('sales.draft.fromUnknown')}
          {mailbox && !mailbox.canSend ? ` ${t('sales.draft.cannotSend')}` : ''}
        </p>
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void flush().then((saved) => {
              if (saved) toast.success(t('sales.draft.saved'))
            })
          }}
        >
          <TextField name="subject" label={t('sales.draft.subject')} required autoComplete="off" />
          <TextField
            name="to"
            label={t('sales.draft.to')}
            required
            autoComplete="off"
            hint={t('sales.draft.addressHint')}
          />
          <TextField name="cc" label={t('sales.draft.cc')} autoComplete="off" />
          {/* Plain text: a textarea, never HTML */}
          <TextField name="bodyText" label={t('sales.draft.body')} required rows={10} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={update.isPending || !dirty}>
              {t('sales.draft.saveChanges')}
            </Button>
            {dirty && (
              <span className="text-xs text-muted-foreground">{t('sales.draft.unsaved')}</span>
            )}
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {actions({
            draft,
            mailbox,
            dirty,
            current,
            flush,
            keepEdits: () => {
              setStale(true)
            },
          })}
        </div>
      </section>
    </FormProvider>
  )
}
