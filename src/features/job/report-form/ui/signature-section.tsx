import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AttachmentImage, type JobReport, useSignReport } from '@/entities/report'
import { isConflict } from '@/shared/api/api-error'
import { Button } from '@/shared/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { SignaturePad, type SignaturePadHandle } from '@/shared/ui/signature-pad'

import { Section } from './section'

const MIN_NAME = 2

/** The client signs on the phone (finger or pen); the signer's name goes with it. */
export function SignatureSection({
  jobId,
  report,
  required,
}: {
  jobId: string
  report: Pick<JobReport, 'signedByName' | 'signatureAttachmentId'>
  required: boolean
}) {
  const { t } = useTranslation()
  const [redoing, setRedoing] = useState(false)
  const signed = Boolean(report.signatureAttachmentId) && !redoing
  return (
    <Section
      title={t('report.signature.title')}
      aside={required && !signed ? t('report.signature.required') : null}
    >
      {signed && report.signatureAttachmentId ? (
        <div className="space-y-3">
          <AttachmentImage
            attachmentId={report.signatureAttachmentId}
            alt={t('report.signature.alt')}
            className="h-32 w-full rounded-lg border bg-white object-contain"
          />
          <p className="text-sm">
            {t('report.signature.signedBy', { name: report.signedByName ?? '' })}
          </p>
          <Button
            variant="outline"
            size="lg"
            className="h-12 w-full"
            onClick={() => {
              setRedoing(true)
            }}
          >
            {t('report.signature.again')}
          </Button>
        </div>
      ) : (
        <SignaturePanel
          jobId={jobId}
          initialName={report.signedByName ?? ''}
          onSigned={() => {
            setRedoing(false)
          }}
        />
      )}
    </Section>
  )
}

function SignaturePanel({
  jobId,
  initialName,
  onSigned,
}: {
  jobId: string
  initialName: string
  onSigned: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const pad = useRef<SignaturePadHandle>(null)
  const sign = useSignReport(jobId)
  const [name, setName] = useState(initialName)
  const [ink, setInk] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; ink?: string }>({})

  async function save() {
    const next: typeof errors = {}
    if (name.trim().length < MIN_NAME) next.name = t('report.signature.errors.nameRequired')
    if (!ink) next.ink = t('report.signature.errors.inkRequired')
    setErrors(next)
    if (next.name || next.ink) return
    const png = await pad.current?.toBlob()
    if (!png) {
      setErrors({ ink: t('report.signature.errors.inkRequired') })
      return
    }
    sign.mutate(
      { png, signedByName: name.trim() },
      {
        onSuccess: onSigned,
        onError: (error) => {
          if (!isConflict(error)) toast.error(t('report.signature.failed'))
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      <Field data-invalid={errors.name ? true : undefined}>
        <FieldLabel htmlFor={`${id}-name`}>{t('report.signature.name')}</FieldLabel>
        <Input
          id={`${id}-name`}
          className="h-12 text-base"
          autoComplete="off"
          value={name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <FieldError>{errors.name}</FieldError>
      </Field>
      <Field data-invalid={errors.ink ? true : undefined}>
        <SignaturePad ref={pad} label={t('report.signature.draw')} onInkChange={setInk} />
        <FieldDescription>{t('report.signature.hint')}</FieldDescription>
        <FieldError>{errors.ink}</FieldError>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          className="h-12"
          disabled={sign.isPending}
          onClick={() => {
            pad.current?.clear()
          }}
        >
          {t('report.signature.clear')}
        </Button>
        <Button
          size="lg"
          className="h-12"
          disabled={sign.isPending}
          onClick={() => {
            void save()
          }}
        >
          {sign.isPending ? t('report.signature.saving') : t('report.signature.save')}
        </Button>
      </div>
    </div>
  )
}
