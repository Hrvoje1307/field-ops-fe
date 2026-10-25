import { CameraIcon, Trash2Icon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type Attachment, AttachmentImage, useDeleteAttachment } from '@/entities/report'
import { isConflict } from '@/shared/api/api-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Spinner } from '@/shared/ui/spinner'

import { usePhotoQueue } from '../model/use-photo-queue'
import { Section } from './section'

export function PhotosSection({ jobId, photos }: { jobId: string; photos: Attachment[] }) {
  const { t } = useTranslation()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const { queue, add, retry, discard } = usePhotoQueue(jobId)
  const remove = useDeleteAttachment(jobId)
  const [viewing, setViewing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  return (
    <Section title={t('report.photos.title')}>
      {photos.length === 0 && queue.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('report.photos.empty')}</p>
      )}
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              <button
                type="button"
                className="block w-full overflow-hidden rounded-lg"
                aria-label={t('report.photos.open', { index: index + 1 })}
                onClick={() => {
                  setViewing(index)
                }}
              >
                <AttachmentImage
                  attachmentId={photo.id}
                  thumbnail
                  alt={t('report.photos.alt', { index: index + 1 })}
                  className="aspect-square w-full"
                />
              </button>
              <Button
                variant="secondary"
                size="icon-xs"
                className="absolute top-1 right-1 size-8"
                aria-label={t('report.photos.remove', { index: index + 1 })}
                onClick={() => {
                  setRemoving(photo.id)
                }}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {queue.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {queue.map((photo) => (
            <li
              key={photo.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              {photo.status === 'uploading' ? (
                <span className="flex items-center gap-2">
                  <Spinner aria-hidden="true" role="presentation" />
                  {t('report.photos.uploading', { name: photo.name })}
                </span>
              ) : (
                <span role="alert" className="text-destructive">
                  {photo.status === 'failed'
                    ? t('report.photos.failed', { name: photo.name })
                    : photo.status === 'unsupported'
                      ? t('report.photos.unsupported', { name: photo.name })
                      : t('report.photos.tooLarge', { name: photo.name })}
                </span>
              )}
              {photo.status !== 'uploading' && (
                <span className="flex shrink-0 gap-2">
                  {photo.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        retry(photo.id)
                      }}
                    >
                      {t('report.photos.retry')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      discard(photo.id)
                    }}
                  >
                    {t('report.photos.discard')}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label={t('report.photos.add')}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []))
          // The same photo can be chosen again
          event.target.value = ''
        }}
      />
      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full"
        onClick={() => {
          input.current?.click()
        }}
      >
        <CameraIcon aria-hidden="true" />
        {t('report.photos.add')}
      </Button>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
      >
        <DialogContent className="p-2">
          <DialogTitle className="sr-only">{t('report.photos.viewer')}</DialogTitle>
          <DialogDescription className="sr-only">{t('report.photos.viewer')}</DialogDescription>
          {viewing !== null && photos[viewing] && (
            <AttachmentImage
              attachmentId={photos[viewing].id}
              alt={t('report.photos.alt', { index: viewing + 1 })}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={t('report.photos.removeTitle')}
        description={t('report.photos.removeDescription')}
        confirmLabel={t('report.photos.removeConfirm')}
        pending={remove.isPending}
        onConfirm={() => {
          if (!removing) return
          remove.mutate(removing, {
            onSuccess: () => {
              setRemoving(null)
            },
            onError: (error) => {
              setRemoving(null)
              if (!isConflict(error)) toast.error(t('report.photos.removeFailed'))
            },
          })
        }}
      />
    </Section>
  )
}
