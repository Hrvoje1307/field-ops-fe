import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Deal } from '@/entities/deal'
import { useTenantFormat } from '@/shared/lib/tenant-format'

/** What is known about the deal: contact, value, dates, source, notes, why it was lost. */
export function DealDetails({ deal }: { deal: Deal }) {
  const { t } = useTranslation()
  const { formatMoney, formatPhone, formatDate, formatRelativeDateTime } = useTenantFormat()
  const none = t('sales.deal.none')
  const extracted = deal.extracted
  return (
    <section aria-label={t('sales.pages.deal')} className="space-y-4 rounded-xl border p-4">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Item label={t('sales.deal.fields.client')}>
          {deal.client ? (
            <Link
              to="/clients/$clientId"
              params={{ clientId: deal.client.id }}
              className="underline-offset-2 hover:underline"
            >
              {deal.client.name}
            </Link>
          ) : (
            none
          )}
        </Item>
        <Item label={t('sales.deal.fields.contactName')}>{deal.contactName ?? none}</Item>
        <Item label={t('sales.deal.fields.contactPhone')}>
          {deal.contactPhone ? formatPhone(deal.contactPhone) : none}
        </Item>
        <Item label={t('sales.deal.fields.contactEmail')}>{deal.contactEmail ?? none}</Item>
        <Item label={t('sales.deal.fields.value')}>
          {deal.value ? formatMoney(deal.value) : none}
        </Item>
        <Item label={t('sales.deal.fields.expectedCloseDate')}>
          {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : none}
        </Item>
        <Item label={t('sales.deal.fields.owner')}>{deal.owner?.fullName ?? none}</Item>
        <Item label={t('sales.deal.fields.source')}>{t(`sales.source.${deal.source}`)}</Item>
        <Item label={t('sales.deal.fields.lastContact')}>
          {deal.lastContactAt ? formatRelativeDateTime(deal.lastContactAt) : none}
        </Item>
        <Item label={t('sales.deal.fields.threads')}>
          {deal.threads.length === 0
            ? t('sales.deal.threadsNone')
            : deal.threads.map((thread) => thread.subject).join(', ')}
        </Item>
        {deal.lostReason && (
          <Item label={t('sales.deal.fields.lostReason')}>
            {t(`sales.lostReason.${deal.lostReason}`)}
            {deal.lostNote ? `: ${deal.lostNote}` : ''}
          </Item>
        )}
      </dl>
      {deal.notes && (
        <div className="space-y-1 text-sm">
          <h3 className="font-medium">{t('sales.deal.fields.notes')}</h3>
          <p className="whitespace-pre-wrap">{deal.notes}</p>
        </div>
      )}
      {extracted?.request && (
        <div className="space-y-1 text-sm">
          <h3 className="font-medium">{t('sales.deal.fields.extracted')}</h3>
          <p>{extracted.request}</p>
        </div>
      )}
    </section>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}
