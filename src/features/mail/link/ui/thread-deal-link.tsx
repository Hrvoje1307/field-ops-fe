import { zodResolver } from '@hookform/resolvers/zod'
import { LinkIcon, PlusIcon, UnlinkIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildDealSchema,
  DealFields,
  type DealFormValues,
  toDealBody,
  useListDeals,
} from '@/entities/deal'
import { type MailThread, useLinkMailThread } from '@/entities/mail-thread'
import { useListSalesStages } from '@/entities/sales-stage'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { useDebouncedValue } from '@/shared/lib/use-debounced-value'
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
import { FormSheet } from '@/shared/ui/form-sheet'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Skeleton } from '@/shared/ui/skeleton'

import { dealFromThread } from '../model/deal-from-thread'

/**
 * Where the conversation stands with the deals: linked (with "Odveži", after a question),
 * or not yet, with "Poveži s prilikom" (a search of the deals) and "Napravi priliku"
 * (a deal started from the conversation, confirmed by the person).
 */
export function ThreadDealLink({ thread }: { thread: MailThread }) {
  const { t } = useTranslation()
  const link = useLinkMailThread()
  const [mode, setMode] = useState<'pick' | 'create' | 'unlink' | null>(null)
  const close = () => {
    setMode(null)
  }

  if (thread.deal) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMode('unlink')
          }}
        >
          <UnlinkIcon aria-hidden="true" />
          {t('sales.link.unlink')}
        </Button>
        <ConfirmDialog
          open={mode === 'unlink'}
          onOpenChange={(open) => {
            if (!open) {
              link.reset()
              close()
            }
          }}
          title={t('sales.link.unlinkTitle')}
          description={t('sales.link.unlinkDescription')}
          confirmLabel={t('sales.link.unlinkConfirm')}
          confirmVariant="default"
          pending={link.isPending}
          error={
            link.isError
              ? salesErrorCode(link.error)
                ? salesErrorMessage(link.error)
                : t('sales.link.unlinkFailed')
              : null
          }
          onConfirm={() => {
            link.mutate(
              { id: thread.id, body: { dealId: null } },
              {
                onSuccess: () => {
                  toast.success(t('sales.link.unlinked'))
                  close()
                },
              },
            )
          }}
        />
      </>
    )
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setMode('pick')
        }}
      >
        <LinkIcon aria-hidden="true" />
        {t('sales.link.linkDeal')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setMode('create')
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('sales.link.createDeal')}
      </Button>
      {mode === 'pick' && <PickDealDialog thread={thread} onClose={close} />}
      {mode === 'create' && <CreateDealSheet thread={thread} onClose={close} />}
    </>
  )
}

function PickDealDialog({ thread, onClose }: { thread: MailThread; onClose: () => void }) {
  const { t } = useTranslation()
  const link = useLinkMailThread()
  const [text, setText] = useState('')
  const q = useDebouncedValue(text.trim(), 300)
  const deals = useListDeals({ ...(q ? { q } : {}), status: 'open', pageSize: 8 })
  const failure = link.isError
    ? salesErrorCode(link.error)
      ? salesErrorMessage(link.error)
      : t('sales.link.failed')
    : null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !link.isPending) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sales.link.searchTitle')}</DialogTitle>
          <DialogDescription>{thread.subject}</DialogDescription>
        </DialogHeader>
        {failure && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1">
          <Label htmlFor="link-deal-search">{t('sales.link.searchLabel')}</Label>
          <Input
            id="link-deal-search"
            type="search"
            autoComplete="off"
            autoFocus
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
          />
          <p className="text-xs text-muted-foreground">{t('sales.link.searchHint')}</p>
        </div>
        {deals.isPending ? (
          <Skeleton className="h-24" />
        ) : deals.isError ? (
          <p className="text-sm text-destructive">{t('sales.link.searchFailed')}</p>
        ) : deals.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sales.link.searchEmpty')}</p>
        ) : (
          <ul
            aria-label={t('sales.link.searchTitle')}
            className="divide-y rounded-lg border text-sm"
          >
            {deals.data.items.map((deal) => (
              <li key={deal.id} className="flex items-center justify-between gap-2 p-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{deal.title}</span>
                  <span className="block truncate text-muted-foreground">
                    {[deal.client?.name ?? deal.contactName, deal.stage.name]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={link.isPending}
                  aria-label={t('sales.link.choose', { title: deal.title })}
                  onClick={() => {
                    link.mutate(
                      { id: thread.id, body: { dealId: deal.id } },
                      {
                        onSuccess: () => {
                          toast.success(t('sales.link.done'))
                          onClose()
                        },
                      },
                    )
                  }}
                >
                  {t('sales.link.linkDeal')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateDealSheet({ thread, onClose }: { thread: MailThread; onClose: () => void }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const stages = useListSalesStages()
  const open = useMemo(
    () => (stages.data ?? []).filter((stage) => stage.kind === 'open' && stage.isActive),
    [stages.data],
  )
  const schema = useMemo(() => buildDealSchema(), [])
  const form = useForm<DealFormValues>({
    resolver: zodResolver(schema),
    defaultValues: dealFromThread(thread, formatPhone),
  })
  const link = useLinkMailThread()

  const submit = form.handleSubmit(async (values) => {
    try {
      await link.mutateAsync({
        id: thread.id,
        body: { createDeal: toDealBody(values, { source: 'email' }) },
      })
      toast.success(t('sales.link.created'))
      onClose()
    } catch (error) {
      reportSaveError(
        error,
        form,
        salesErrorCode(error) ? salesErrorMessage(error) : t('sales.link.failed'),
      )
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        title={t('sales.link.createTitle')}
        description={t('sales.link.createDescription')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <DealFields stages={open} />
      </FormSheet>
    </FormProvider>
  )
}
