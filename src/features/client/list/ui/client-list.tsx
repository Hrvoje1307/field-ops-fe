import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CLIENT_STALE_TIME, clientKeys, type ClientSummary, listClients } from '@/entities/client'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Field, FieldLabel } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

import {
  CLEAR_FILTERS,
  type ClientsSearch,
  hasActiveFilters,
  PAGE_SIZE,
  SORT_NAMES,
  toListClientsParams,
  TYPE_FILTERS,
} from '../model/search'

export type ClientsSearchChange = (
  patch: Partial<ClientsSearch>,
  options?: { replace?: boolean },
) => void

const SEARCH_DELAY_MS = 300

/** Client list with search and filters (kept in the URL by the caller), paging and states. */
export function ClientList({
  search,
  onSearchChange,
}: {
  search: ClientsSearch
  onSearchChange: ClientsSearchChange
}) {
  const { t } = useTranslation()
  const ids = useId()
  const params = toListClientsParams(search)
  const clients = useQuery({
    queryKey: clientKeys.list(params),
    queryFn: async ({ signal }) => {
      return listClients(params, signal)
    },
    staleTime: CLIENT_STALE_TIME,
    placeholderData: keepPreviousData,
  })
  const filtered = hasActiveFilters(search)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <SearchBox
          value={search.q ?? ''}
          onCommit={(q) => {
            onSearchChange({ q: q || undefined, page: 1 }, { replace: true })
          }}
        />
        <Field className="w-auto">
          <FieldLabel htmlFor={`${ids}-type`}>{t('client.list.type')}</FieldLabel>
          <NativeSelect
            id={`${ids}-type`}
            value={search.type}
            onChange={(event) => {
              onSearchChange({ type: event.target.value as ClientsSearch['type'], page: 1 })
            }}
          >
            {TYPE_FILTERS.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {type === 'all' ? t('client.list.allTypes') : t(`client.type.${type}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-auto">
          <FieldLabel htmlFor={`${ids}-sort`}>{t('client.list.sort')}</FieldLabel>
          <NativeSelect
            id={`${ids}-sort`}
            value={search.sort}
            onChange={(event) => {
              onSearchChange({ sort: event.target.value as ClientsSearch['sort'], page: 1 })
            }}
          >
            {SORT_NAMES.map((sort) => (
              <NativeSelectOption key={sort} value={sort}>
                {t(`client.list.sortOption.${sort}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              onSearchChange(CLEAR_FILTERS)
            }}
          >
            {t('client.list.clearFilters')}
          </Button>
        )}
      </div>

      {clients.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : clients.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('client.list.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void clients.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : clients.data.items.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {filtered || search.page > 1 ? t('client.list.emptyFiltered') : t('client.list.empty')}
          </p>
          {filtered && (
            <Button
              variant="outline"
              onClick={() => {
                onSearchChange(CLEAR_FILTERS)
              }}
            >
              {t('client.list.clearFilters')}
            </Button>
          )}
        </div>
      ) : (
        <div aria-busy={clients.isPlaceholderData} className="space-y-4">
          <ClientsTable clients={clients.data.items} />
          <Pagination
            page={clients.data.page}
            totalCount={clients.data.totalCount}
            onPage={(page) => {
              onSearchChange({ page })
            }}
          />
        </div>
      )}
    </div>
  )
}

function ClientsTable({ clients }: { clients: ClientSummary[] }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('client.list.columns.name')}</TableHead>
            <TableHead>{t('client.list.columns.phone')}</TableHead>
            <TableHead>{t('client.list.columns.address')}</TableHead>
            <TableHead className="text-right">{t('client.list.columns.openJobs')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            // The name link covers the row, so the whole row opens the client
            <TableRow key={client.id} className="relative" data-testid="client-row">
              <TableCell>
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {client.name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t(`client.type.${client.type}`)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {client.primaryPhone ? formatPhone(client.primaryPhone) : '—'}
              </TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">
                {client.primaryAddress ?? '—'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{client.openJobsCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Pagination({
  page,
  totalCount,
  onPage,
}: {
  page: number
  totalCount: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  return (
    <nav
      aria-label={t('client.list.pagination')}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground" data-testid="clients-range">
        {t('client.list.range', {
          from: (page - 1) * PAGE_SIZE + 1,
          to: Math.min(page * PAGE_SIZE, totalCount),
          total: totalCount,
        })}
      </p>
      {lastPage > 1 && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              onPage(page - 1)
            }}
          >
            {t('client.list.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => {
              onPage(page + 1)
            }}
          >
            {t('client.list.next')}
          </Button>
        </div>
      )}
    </nav>
  )
}

/** Search text, sent to the URL after a short pause in typing. */
function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (text.trim() !== value) setText(value)
  }
  const commit = useEffectEvent(onCommit)
  useEffect(() => {
    const q = text.trim()
    if (q === value) return
    const timer = setTimeout(() => {
      commit(q)
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text, value])

  return (
    <Field className="max-w-md flex-1">
      <FieldLabel htmlFor={id}>{t('client.list.search')}</FieldLabel>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={id}
          type="search"
          className="pl-8"
          placeholder={t('client.list.searchPlaceholder')}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
      </div>
    </Field>
  )
}
