import { PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  getAttachmentUrl,
  useDeleteDealAttachment,
  useListDealAttachments,
  useUploadDealFile,
} from '@/entities/report'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

/** What the contract accepts for a `doc`. */
const ACCEPT = 'application/pdf,image/jpeg,image/png'

const sizeText = (bytes: number) =>
  bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} kB`

/** The files kept with the deal; converting the deal copies them to the job. */
export function DealAttachments({ dealId }: { dealId: string }) {
  const { t } = useTranslation()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const { formatDateTime } = useTenantFormat()
  const files = useListDealAttachments(dealId)
  const upload = useUploadDealFile(dealId)
  const remove = useDeleteDealAttachment(dealId)

  async function open(attachmentId: string) {
    try {
      const link = await getAttachmentUrl(attachmentId)
      window.open(link.url, '_blank', 'noopener')
    } catch {
      toast.error(t('sales.files.openFailed'))
    }
  }

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="font-semibold">
          {t('sales.files.title')}
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
        >
          <PaperclipIcon aria-hidden="true" />
          {upload.isPending ? t('sales.files.uploading') : t('sales.files.add')}
        </Button>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          aria-label={t('sales.files.input')}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            upload.mutate(file, {
              onSuccess: () => {
                toast.success(t('sales.files.added'))
              },
              onError: () => {
                toast.error(t('sales.files.addFailed'))
              },
            })
          }}
        />
      </div>
      {files.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.files.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void files.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : !files.data ? (
        <Skeleton className="h-12" />
      ) : files.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sales.files.empty')}</p>
      ) : (
        <ul aria-label={t('sales.files.title')} className="divide-y text-sm">
          {files.data.map((file) => (
            <li key={file.id} className="flex items-center gap-2 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left hover:underline"
                onClick={() => void open(file.id)}
              >
                <span className="block truncate font-medium">
                  {file.fileName ?? t('sales.files.unnamed')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {sizeText(file.sizeBytes)}, {formatDateTime(file.createdAt)}
                </span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('sales.files.remove', {
                  name: file.fileName ?? t('sales.files.unnamed'),
                })}
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(file.id, {
                    onError: () => {
                      toast.error(t('sales.files.removeFailed'))
                    },
                  })
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
