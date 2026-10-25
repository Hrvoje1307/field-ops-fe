import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { isFailure, type Message, MessageStatusBadge, useListMessages } from '@/entities/message'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

import {
  PAGE_SIZE,
  STATUS_FILTERS,
  type MessagesSearch,
  type MessagesSearchChange,
  toListMessagesParams,
} from '../model/search'

/** Everything the tenant has sent to clients, with a way to find what did not arrive. */
export function MessageList({
  search,
  onSearchChange,
}: {
  search: MessagesSearch
  onSearchChange: MessagesSearchChange
}) {
  const { t } = useTranslation()
  const messages = useListMessages(toListMessagesParams(search))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('message.list.status')}</span>
          <NativeSelect
            value={search.status}
            onChange={(event) => {
              onSearchChange({
                status: event.target.value as MessagesSearch['status'],
                page: 1,
              })
            }}
          >
            {STATUS_FILTERS.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {status === 'all' ? t('message.list.allStatuses') : t(`message.status.${status}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>

      {messages.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : messages.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('message.list.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void messages.refetch()}>
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : messages.data.items.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">
            {search.status !== 'all' || search.page > 1
              ? t('message.list.emptyFiltered')
              : t('message.list.empty')}
          </p>
          {(search.status !== 'all' || search.page > 1) && (
            <Button
              variant="outline"
              onClick={() => {
                onSearchChange({ status: 'all', page: 1 })
              }}
            >
              {t('message.list.clearFilters')}
            </Button>
          )}
        </div>
      ) : (
        <div aria-busy={messages.isPlaceholderData} className="space-y-4">
          <MessagesTable messages={messages.data.items} />
          <Pager
            page={messages.data.page}
            totalCount={messages.data.totalCount}
            onPage={(page) => {
              onSearchChange({ page })
            }}
          />
        </div>
      )}
    </div>
  )
}

function MessagesTable({ messages }: { messages: Message[] }) {
  const { t } = useTranslation()
  const { formatRelativeDateTime, formatMoney } = useTenantFormat()
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('message.list.columns.time')}</TableHead>
            <TableHead>{t('message.list.columns.to')}</TableHead>
            <TableHead>{t('message.list.columns.channel')}</TableHead>
            <TableHead>{t('message.list.columns.status')}</TableHead>
            <TableHead>{t('message.list.columns.text')}</TableHead>
            <TableHead className="text-right">{t('message.list.columns.cost')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {messages.map((message) => (
            <TableRow key={message.id} data-testid="message-row">
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatRelativeDateTime(message.createdAt)}
              </TableCell>
              <TableCell>{message.to}</TableCell>
              <TableCell>{t(`settings.messages.channels.${message.channel}`)}</TableCell>
              <TableCell className="space-y-1">
                <MessageStatusBadge status={message.status} />
                {isFailure(message) && message.error && (
                  <p className="text-xs text-destructive">{message.error}</p>
                )}
              </TableCell>
              <TableCell className="max-w-sm whitespace-normal">
                {message.subject && <p className="font-medium">{message.subject}</p>}
                <p className="line-clamp-2 text-muted-foreground">{message.body}</p>
                {message.jobId && (
                  <Link
                    to="/jobs/$jobId"
                    params={{ jobId: message.jobId }}
                    className="text-xs underline-offset-4 hover:underline"
                  >
                    {t('message.list.openJob')}
                  </Link>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {message.cost ? formatMoney(message.cost) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Pager({
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
      aria-label={t('message.list.pagination')}
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground" data-testid="messages-range">
        {t('message.list.range', {
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
            {t('message.list.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => {
              onPage(page + 1)
            }}
          >
            {t('message.list.next')}
          </Button>
        </div>
      )}
    </nav>
  )
}
