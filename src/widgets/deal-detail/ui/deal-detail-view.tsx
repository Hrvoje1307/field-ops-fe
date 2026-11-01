import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useDeleteDeal, useGetDeal } from '@/entities/deal'
import { DealAttachments } from '@/features/deal/attachments'
import { DealActivities } from '@/features/deal/activities'
import { DealDetails } from '@/features/deal/details'
import { EditDealButton } from '@/features/deal/edit'
import { DealFollowUp } from '@/features/deal/follow-up'
import { DealStageSelect } from '@/features/deal/move'
import { isClientError } from '@/shared/api/api-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Skeleton } from '@/shared/ui/skeleton'

/**
 * One deal: its facts, stage, follow-up and timeline, and what can be done with it. A
 * deal with a job no longer offers the conversion, only the way to the job. The
 * conversion form is the page's (`onConvert`).
 */
export function DealDetailView({
  dealId,
  onConvert,
  onDeleted,
}: {
  dealId: string
  onConvert: (dealId: string, title: string) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const query = useGetDeal(dealId)
  const remove = useDeleteDeal()
  const [deleting, setDeleting] = useState(false)
  const deal = query.data

  if (query.isError) {
    const gone = isClientError(query.error) && query.error.status === 404
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {gone ? t('sales.deal.notFound') : t('sales.deal.loadFailed')}
        </AlertDescription>
        <AlertAction>
          {gone ? (
            <Button size="sm" variant="outline" asChild>
              <Link to="/sales/board">{t('sales.deal.back')}</Link>
            </Button>
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
  if (!deal) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-56" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link
        to="/sales/board"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground max-md:min-h-11"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        {t('sales.deal.back')}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold break-words">{deal.title}</h1>
          <DealStageSelect
            deal={deal}
            onWon={(won) => {
              onConvert(won.id, won.title)
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2 max-md:w-full max-md:flex-col max-md:[&_a]:h-11 max-md:[&_button]:h-11 max-md:[&>*]:w-full">
          {deal.jobId ? (
            <Button variant="outline" asChild>
              <Link to="/jobs/$jobId" params={{ jobId: deal.jobId }}>
                <ExternalLinkIcon aria-hidden="true" />
                {t('sales.deal.jobOpen')}
              </Link>
            </Button>
          ) : (
            <Button
              onClick={() => {
                onConvert(deal.id, deal.title)
              }}
            >
              {t('sales.convert.title')}
            </Button>
          )}
          <EditDealButton deal={deal} />
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(true)
            }}
          >
            {t('sales.deal.delete')}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <DealDetails deal={deal} />
          <DealActivities dealId={deal.id} />
        </div>
        <div className="space-y-4">
          <DealFollowUp deal={deal} />
          <DealAttachments dealId={deal.id} />
        </div>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('sales.deal.deleteTitle')}
        description={t('sales.deal.deleteDescription')}
        confirmLabel={t('sales.deal.delete')}
        pending={remove.isPending}
        error={remove.isError ? t('sales.deal.deleteFailed') : null}
        onConfirm={() => {
          remove.mutate(deal.id, {
            onSuccess: () => {
              toast.success(t('sales.deal.deleted'))
              onDeleted()
            },
          })
        }}
      />
    </div>
  )
}
