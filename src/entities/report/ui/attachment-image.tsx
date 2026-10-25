import { cn } from 'cn'
import { ImageOffIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/shared/ui/skeleton'

import { useGetAttachmentUrl } from '../api'

/** An image attachment (photo, signature) from its short-lived link. */
export function AttachmentImage({
  attachmentId,
  alt,
  className,
  thumbnail = false,
}: {
  attachmentId: string
  alt: string
  className?: string
  /** The small version, for grids. */
  thumbnail?: boolean
}) {
  const { t } = useTranslation()
  const link = useGetAttachmentUrl(attachmentId)
  if (link.isPending) return <Skeleton className={cn('aspect-[4/3]', className)} />
  const src = thumbnail ? (link.data?.thumbnailUrl ?? link.data?.url) : link.data?.url
  if (link.isError || !src) {
    return (
      <div
        role="img"
        aria-label={t('report.photos.unavailable')}
        className={cn('flex aspect-[4/3] items-center justify-center bg-muted', className)}
      >
        <ImageOffIcon aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" className={cn('object-cover', className)} />
}
