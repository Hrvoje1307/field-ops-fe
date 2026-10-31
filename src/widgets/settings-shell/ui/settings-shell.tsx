import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useMe } from '@/entities/auth'

import { settingsSectionsFor } from '../config/sections'

/** The settings area: its title, the list of sections and the section's own screen. */
export function SettingsShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const sections = settingsSectionsFor(useMe())
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <nav
          aria-label={t('settings.nav.label')}
          className="flex gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col"
        >
          {sections.map(({ to, labelKey }) => (
            <Link
              key={to}
              to={to}
              className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </div>
  )
}
