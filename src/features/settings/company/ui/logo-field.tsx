import { useEffect, useRef, useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { useUploadTenantLogo } from '@/entities/report'
import type { Tenant, TenantFormValues } from '@/entities/tenant'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/spinner'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 2 * 1024 * 1024

/**
 * Choosing a picture uploads it at once; the form then holds the file's id and saving the
 * company links it. The picture shown is the chosen one until the company is saved.
 */
export function LogoField({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation()
  const { setValue } = useFormContext<TenantFormValues>()
  const logoId = useWatch<TenantFormValues, 'logoAttachmentId'>({ name: 'logoAttachmentId' })
  const upload = useUploadTenantLogo(tenant.id)
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const shown =
    logoId === '' ? null : (preview ?? (logoId === tenant.logoAttachmentId ? tenant.logoUrl : null))

  const choose = (file: File | undefined) => {
    if (!file) return
    setProblem(null)
    setUploaded(false)
    if (!ACCEPTED.includes(file.type)) {
      setProblem(t('settings.company.logo.wrongType'))
      return
    }
    if (file.size > MAX_BYTES) {
      setProblem(t('settings.company.logo.tooBig'))
      return
    }
    upload.mutate(file, {
      onSuccess: (attachment) => {
        setPreview(URL.createObjectURL(file))
        setUploaded(true)
        setValue('logoAttachmentId', attachment.id, { shouldDirty: true })
      },
      onError: () => {
        setProblem(t('settings.company.logo.failed'))
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-32 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
          {shown ? (
            <img
              src={shown}
              alt={t('settings.company.logo.alt')}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">
              {t('settings.company.logo.none')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-label={t('settings.company.logo.choose')}
            data-testid="logo-input"
            onChange={(event) => {
              choose(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            {upload.isPending ? (
              <>
                <Spinner />
                {t('settings.company.logo.uploading')}
              </>
            ) : shown ? (
              t('settings.company.logo.change')
            ) : (
              t('settings.company.logo.choose')
            )}
          </Button>
          {logoId !== '' && (
            <Button
              type="button"
              variant="ghost"
              disabled={upload.isPending}
              onClick={() => {
                setPreview(null)
                setUploaded(false)
                setValue('logoAttachmentId', '', { shouldDirty: true })
              }}
            >
              {t('settings.company.logo.remove')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{t('settings.company.logo.hint')}</p>
      {uploaded && (
        <p role="status" className="text-sm">
          {t('settings.company.logo.uploaded')}
        </p>
      )}
      {problem && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
