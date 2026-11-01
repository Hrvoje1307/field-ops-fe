import { useTranslation } from 'react-i18next'

import {
  type ReportSearch,
  type ReportSearchChange,
  SalesReportView,
} from '@/features/sales/report'

export function SalesReportPage({
  search,
  onSearchChange,
}: {
  search: ReportSearch
  onSearchChange: ReportSearchChange
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('sales.pages.report')}</h1>
      <SalesReportView search={search} onSearchChange={onSearchChange} />
    </div>
  )
}
