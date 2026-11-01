import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSalesAccess } from '@/entities/auth'
import {
  type AiFields,
  aiFormValues,
  type AiFormValues,
  buildAiSchema,
  type DataLoss,
  DataLossDialog,
  dataLossOf,
  KNOWLEDGE_MAX,
  LANGUAGE_AUTO,
  LANGUAGE_OTHER,
  languageName,
  type SalesSettings,
  tenantLanguage,
  toAiFields,
  TONES,
  useGetSalesSettings,
  useSaveSalesSettings,
} from '@/entities/sales-config'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { FormSection } from '@/shared/ui/form-section'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

/**
 * How the AI behaves (tone, language, signature, what it may say about the business, the
 * threshold for review) plus the response time and how long mail content is kept. It writes
 * its own fields of the settings record and leaves the digest's as they are.
 */
export function SalesAiSettings() {
  const { t } = useTranslation()
  const settings = useGetSalesSettings()
  if (settings.data) return <AiBody settings={settings.data} />
  if (settings.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('sales.settings.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void settings.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <Skeleton className="h-96" />
}

function AiBody({ settings }: { settings: SalesSettings }) {
  const { t, i18n } = useTranslation()
  const { locale } = useTenantFormat()
  const { hasAi } = useSalesAccess()
  const tenantTag = tenantLanguage(locale)
  const schema = useMemo(() => buildAiSchema(), [])
  const form = useForm<AiFormValues>({
    resolver: zodResolver(schema),
    defaultValues: aiFormValues(settings, tenantTag),
  })
  const save = useSaveSalesSettings()
  const [pending, setPending] = useState<{ fields: AiFields; loss: DataLoss[] } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const aiEnabled = useWatch({ control: form.control, name: 'aiEnabled' })
  const language = useWatch({ control: form.control, name: 'language' })
  const knowledge = useWatch({ control: form.control, name: 'knowledge' })
  const aiInactive = !hasAi || !aiEnabled
  const inactiveNote = !hasAi ? t('sales.settings.ai.noPlan') : t('sales.settings.ai.off')

  const languageOptions = [
    { value: LANGUAGE_AUTO, label: t('sales.settings.ai.languageAuto') },
    ...(tenantTag
      ? [
          {
            value: tenantTag,
            label: t('sales.settings.ai.languageTenant', {
              name: languageName(tenantTag, i18n.language),
            }),
          },
        ]
      : []),
    { value: LANGUAGE_OTHER, label: t('sales.settings.ai.languageOther') },
  ]

  async function write(fields: AiFields) {
    try {
      const saved = await save.mutateAsync(fields)
      form.reset(aiFormValues(saved, tenantTag))
      setPending(null)
      setConfirmError(null)
      toast.success(t('sales.settings.saved'))
    } catch (error) {
      if (pending) {
        setConfirmError(
          salesErrorCode(error) ? salesErrorMessage(error) : t('sales.settings.saveFailed'),
        )
      } else {
        reportSaveError(
          error,
          form,
          salesErrorCode(error) ? salesErrorMessage(error) : t('sales.settings.saveFailed'),
        )
      }
    }
  }

  const submit = form.handleSubmit(async (values) => {
    const fields = toAiFields(values)
    const loss = dataLossOf(settings, fields)
    if (loss.length > 0) {
      setPending({ fields, loss })
      return
    }
    await write(fields)
  })

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        className="max-w-3xl space-y-6"
        aria-label={t('sales.settings.ai.title')}
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sales.settings.ai.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sales.settings.ai.description')}</p>
        </div>

        <FormSection title={t('sales.settings.ai.enabledSection')}>
          <CheckboxField
            name="aiEnabled"
            label={t('sales.settings.ai.enabled')}
            hint={t('sales.settings.ai.enabledHint')}
          />
        </FormSection>

        <FormSection title={t('sales.settings.ai.draftsSection')}>
          {aiInactive && <InactiveNote>{inactiveNote}</InactiveNote>}
          <FieldRow>
            <SelectField
              name="tone"
              label={t('sales.settings.ai.tone')}
              emptyLabel={t('sales.settings.ai.tone')}
              options={TONES.map((tone) => ({
                value: tone,
                label: t(`sales.settings.ai.toneLabel.${tone}`),
              }))}
            />
            <SelectField
              name="language"
              label={t('sales.settings.ai.language')}
              emptyLabel={t('sales.settings.ai.language')}
              hint={t('sales.settings.ai.languageHint')}
              options={languageOptions}
            />
          </FieldRow>
          {language === LANGUAGE_OTHER && (
            <TextField
              name="customLanguage"
              label={t('sales.settings.ai.customLanguage')}
              hint={t('sales.settings.ai.customLanguageHint')}
              autoComplete="off"
              required
            />
          )}
          <TextField
            name="signature"
            label={t('sales.settings.ai.signature')}
            hint={t('sales.settings.ai.signatureHint')}
            rows={4}
          />
        </FormSection>

        <FormSection title={t('sales.settings.ai.knowledgeSection')}>
          {aiInactive && <InactiveNote>{inactiveNote}</InactiveNote>}
          <TextField
            name="knowledge"
            label={t('sales.settings.ai.knowledge')}
            hint={
              <>
                {t('sales.settings.ai.knowledgeHint')}{' '}
                <span aria-live="polite" data-testid="knowledge-count">
                  {t('sales.settings.ai.knowledgeCount', {
                    count: knowledge.length,
                    max: KNOWLEDGE_MAX,
                  })}
                </span>
              </>
            }
            rows={10}
          />
        </FormSection>

        <FormSection title={t('sales.settings.ai.reviewSection')}>
          {aiInactive && <InactiveNote>{inactiveNote}</InactiveNote>}
          <TextField
            name="reviewThreshold"
            label={t('sales.settings.ai.threshold')}
            hint={t('sales.settings.ai.thresholdHint')}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-48"
          />
        </FormSection>

        <FormSection title={t('sales.settings.ai.responseSection')}>
          <TextField
            name="responseSlaHours"
            label={t('sales.settings.ai.sla')}
            hint={t('sales.settings.ai.slaHint')}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-48"
          />
        </FormSection>

        <FormSection title={t('sales.settings.ai.dataSection')}>
          <TextField
            name="retentionDays"
            label={t('sales.settings.ai.retention')}
            hint={t('sales.settings.ai.retentionHint', { min: 30 })}
            inputMode="numeric"
            autoComplete="off"
            className="max-w-48"
          />
        </FormSection>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || save.isPending}>
            {form.formState.isSubmitting || save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
      <DataLossDialog
        loss={pending?.loss ?? []}
        pending={save.isPending}
        error={confirmError}
        onCancel={() => {
          setPending(null)
          setConfirmError(null)
        }}
        onConfirm={() => {
          if (pending) void write(pending.fields)
        }}
      />
    </FormProvider>
  )
}

function InactiveNote({ children }: { children: string }) {
  return (
    <Alert>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
