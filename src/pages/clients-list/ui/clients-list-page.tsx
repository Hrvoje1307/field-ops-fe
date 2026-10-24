import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ClientList, type ClientsSearch, type ClientsSearchChange } from '@/features/client/list'
import { Button } from '@/shared/ui/button'

export function ClientsListPage({
  search,
  onSearchChange,
}: {
  search: ClientsSearch
  onSearchChange: ClientsSearchChange
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('client.list.title')}</h1>
        <Button asChild>
          <Link to="/clients/new">
            <PlusIcon aria-hidden="true" />
            {t('client.list.newClient')}
          </Link>
        </Button>
      </div>
      <ClientList search={search} onSearchChange={onSearchChange} />
    </div>
  )
}
