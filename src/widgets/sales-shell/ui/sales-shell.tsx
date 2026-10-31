import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SALES_TABS } from '../config/tabs'

/** The Prodaja module: its sections as tabs above the screen of the section. */
export function SalesShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <nav aria-label={t('sales.nav.label')} className="flex gap-1 overflow-x-auto border-b pb-2">
        {SALES_TABS.map(({ to, labelKey, exact }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: exact ?? false }}
            className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
          >
            {t(labelKey)}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
