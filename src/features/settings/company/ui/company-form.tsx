import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildTenantSchema,
  type Tenant,
  tenantFormValues,
  type TenantFormValues,
  toTenantBody,
  useGetTenant,
  useUpdateTenant,
} from '@/entities/tenant'
import { currencyOptions, timeZoneOptions } from '@/shared/lib/intl-options'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { FormSection } from '@/shared/ui/form-section'
import { SelectField } from '@/shared/ui/select-field'
import { Skeleton } from '@/shared/ui/skeleton'
import { FieldRow, TextField } from '@/shared/ui/text-field'

import { LogoField } from './logo-field'

/** The company's data and settings; the owner's form. */
export function CompanyForm() {
  const { t } = useTranslation()
  const tenant = useGetTenant()
  if (tenant.data) return <CompanyFormBody tenant={tenant.data} />
  if (tenant.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('settings.company.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void tenant.refetch()
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

function CompanyFormBody({ tenant }: { tenant: Tenant }) {
  const { t, i18n } = useTranslation()
  const schema = useMemo(() => buildTenantSchema(), [])
  const form = useForm<TenantFormValues>({
    resolver: zodResolver(schema),
    defaultValues: tenantFormValues(tenant),
  })
  const save = useUpdateTenant()
  const timezone = useWatch({ control: form.control, name: 'timezone' })
  const currency = useWatch({ control: form.control, name: 'currency' })
  const timeZones = useMemo(() => timeZoneOptions(timezone), [timezone])
  const currencies = useMemo(
    () => currencyOptions(i18n.language, currency),
    [i18n.language, currency],
  )

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(toTenantBody(values))
      form.reset(tenantFormValues(saved))
      toast.success(t('settings.company.saved'))
    } catch (error) {
      reportSaveError(error, form, t('settings.company.failed'))
    }
  })

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        className="max-w-3xl space-y-6"
        aria-label={t('settings.company.title')}
        noValidate
      >
        <FormSection title={t('settings.company.profile.title')}>
          <TextField name="name" label={t('settings.company.profile.name')} required />
          <FieldRow>
            <TextField name="oib" label={t('settings.company.profile.oib')} inputMode="numeric" />
            <TextField name="iban" label={t('settings.company.profile.iban')} />
          </FieldRow>
          <TextField name="address" label={t('settings.company.profile.address')} />
          <FieldRow>
            <TextField
              name="phone"
              type="tel"
              label={t('settings.company.profile.phone')}
              autoComplete="off"
            />
            <TextField
              name="email"
              type="email"
              label={t('settings.company.profile.email')}
              autoComplete="off"
            />
          </FieldRow>
        </FormSection>

        <FormSection title={t('settings.company.logo.title')}>
          <LogoField tenant={tenant} />
        </FormSection>

        <FormSection title={t('settings.company.region.title')}>
          <TextField
            name="locale"
            label={t('settings.company.region.locale')}
            hint={t('settings.company.region.localeHint')}
            required
          />
          <FieldRow>
            <SelectField
              name="timezone"
              label={t('settings.company.region.timezone')}
              options={timeZones}
              emptyLabel={t('settings.company.region.choose')}
              required
            />
            <SelectField
              name="currency"
              label={t('settings.company.region.currency')}
              options={currencies}
              emptyLabel={t('settings.company.region.choose')}
              required
            />
          </FieldRow>
        </FormSection>

        <FormSection title={t('settings.company.documents.title')}>
          <CheckboxField
            name="settings.requireSignature"
            label={t('settings.company.documents.requireSignature')}
          />
          <FieldRow>
            <TextField
              name="settings.jobNumberPrefix"
              label={t('settings.company.documents.jobNumberPrefix')}
              hint={t('settings.company.documents.jobNumberPrefixHint')}
            />
            <TextField
              name="settings.pdfAccentColor"
              label={t('settings.company.documents.pdfAccentColor')}
              hint={t('settings.company.documents.pdfAccentColorHint')}
              placeholder="#0369a1"
            />
          </FieldRow>
          <TextField
            name="settings.pdfFooter"
            label={t('settings.company.documents.pdfFooter')}
            rows={2}
          />
        </FormSection>

        <FormSection title={t('settings.company.messages.title')}>
          <CheckboxField
            name="settings.onTheWaySmsEnabled"
            label={t('settings.company.messages.onTheWaySmsEnabled')}
          />
          <FieldRow>
            <TextField
              name="settings.reminderSendTime"
              type="time"
              label={t('settings.company.messages.reminderSendTime')}
            />
            <TextField
              name="settings.smsSenderName"
              label={t('settings.company.messages.smsSenderName')}
              hint={t('settings.company.messages.smsSenderNameHint')}
            />
          </FieldRow>
          <FieldRow>
            <TextField
              name="settings.smsQuietHoursStart"
              type="time"
              label={t('settings.company.messages.quietStart')}
              hint={t('settings.company.messages.quietHint')}
            />
            <TextField
              name="settings.smsQuietHoursEnd"
              type="time"
              label={t('settings.company.messages.quietEnd')}
            />
          </FieldRow>
          <TextField
            name="settings.publicLinkValidityHours"
            type="number"
            min={1}
            inputMode="numeric"
            label={t('settings.company.messages.publicLinkValidityHours')}
          />
        </FormSection>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
            {form.formState.isSubmitting
              ? t('settings.company.saving')
              : t('settings.company.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
