import { useTranslation } from 'react-i18next'

import { useGetTenantUsage } from '@/entities/tenant'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { FormSection } from '@/shared/ui/form-section'
import { Skeleton } from '@/shared/ui/skeleton'

/** This month's messages and optimizations, in the tenant's month. */
export function CompanyUsage() {
  const { t } = useTranslation()
  const { today, formatMoney, formatNumber } = useTenantFormat()
  const usage = useGetTenantUsage(today().slice(0, 7))
  return (
    <FormSection title={t('settings.company.usage.title')} className="max-w-3xl">
      {usage.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('settings.company.usage.loadFailed')}</AlertDescription>
        </Alert>
      ) : !usage.data ? (
        <Skeleton className="h-16" />
      ) : (
        <dl className="grid gap-4 sm:grid-cols-4" data-testid="tenant-usage">
          <Figure
            label={t('settings.company.usage.sms')}
            value={formatNumber(usage.data.smsCount)}
          />
          <Figure
            label={t('settings.company.usage.smsCost')}
            value={formatMoney(usage.data.smsCost)}
          />
          <Figure
            label={t('settings.company.usage.email')}
            value={formatNumber(usage.data.emailCount)}
          />
          <Figure
            label={t('settings.company.usage.optimizations')}
            value={formatNumber(usage.data.optimizationsCount)}
          />
        </dl>
      )}
    </FormSection>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
