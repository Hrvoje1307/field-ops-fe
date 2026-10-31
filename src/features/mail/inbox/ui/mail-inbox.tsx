import { PaperclipIcon, SearchIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSalesAccess } from '@/entities/auth'
import { useListMailboxes } from '@/entities/mailbox'
import {
  cardsFor,
  type MailThreadSummary,
  ThreadCategoryBadge,
  useListMailThreads,
} from '@/entities/mail-thread'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { NativeSelect, NativeSelectOption } from '@/shared/ui/native-select'
import { Skeleton } from '@/shared/ui/skeleton'

import {
  hasInboxFilters,
  INBOX_PAGE_SIZE,
  type InboxSearch,
  type InboxSearchChange,
  toListThreadsParams,
} from '../model/search'

const SEARCH_DELAY_MS = 300

/**
 * The conversations the caller can see, by card (a card is a set of API parameters), mailbox
 * and search. The AI's category and "Za pregled" show only with `sales_ai`. The open
 * conversation (`search.thread`) is highlighted; opening one is the caller's (`onSearchChange`).
 */
export function MailInbox({
  search,
  onSearchChange,
}: {
  search: InboxSearch
  onSearchChange: InboxSearchChange
}) {
  const { t } = useTranslation()
  const { hasAi } = useSalesAccess()
  const ids = useId()
  const mailboxes = useListMailboxes()
  const threads = useListMailThreads(toListThreadsParams(search))
  const cards = cardsFor(hasAi)
  const filtered = hasInboxFilters(search)

  return (
    <section aria-label={t('sales.inbox.region')} className="min-w-0 space-y-3">
      <div role="tablist" aria-label={t('sales.inbox.cards')} className="flex flex-wrap gap-1">
        {cards.map((card) => (
          <Button
            key={card}
            role="tab"
            aria-selected={search.card === card}
            size="sm"
            variant={search.card === card ? 'default' : 'outline'}
            onClick={() => {
              onSearchChange({ card, page: 1, thread: undefined })
            }}
          >
            {t(`sales.inbox.card.${card}`)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <SearchBox
          value={search.q ?? ''}
          onCommit={(q) => {
            onSearchChange({ q: q || undefined, page: 1 }, { replace: true })
          }}
        />
        {mailboxes.data && mailboxes.data.length > 1 && (
          <NativeSelect
            aria-label={t('sales.inbox.mailbox')}
            id={`${ids}-mailbox`}
            value={search.mailbox ?? ''}
            onChange={(event) => {
              onSearchChange({ mailbox: event.target.value || undefined, page: 1 })
            }}
          >
            <NativeSelectOption value="">{t('sales.inbox.allMailboxes')}</NativeSelectOption>
            {mailboxes.data.map((mailbox) => (
              <NativeSelectOption key={mailbox.id} value={mailbox.id}>
                {mailbox.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onSearchChange({ q: undefined, mailbox: undefined, page: 1 })
            }}
          >
            {t('sales.inbox.clearFilters')}
          </Button>
        )}
      </div>

      {threads.isPending ? (
        <div aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : threads.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.inbox.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void threads.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : threads.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {filtered || search.page > 1 ? t('sales.inbox.emptyFiltered') : t('sales.inbox.empty')}
        </p>
      ) : (
        <div aria-busy={threads.isPlaceholderData} className="space-y-3">
          <ul className="divide-y rounded-lg border">
            {threads.data.items.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                selected={thread.id === search.thread}
                showAi={hasAi}
                onSelect={() => {
                  onSearchChange({ thread: thread.id })
                }}
              />
            ))}
          </ul>
          <Pagination
            page={threads.data.page}
            totalCount={threads.data.totalCount}
            onPage={(page) => {
              onSearchChange({ page, thread: undefined })
            }}
          />
        </div>
      )}
    </section>
  )
}

function ThreadRow({
  thread,
  selected,
  showAi,
  onSelect,
}: {
  thread: MailThreadSummary
  selected: boolean
  showAi: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const { formatRelativeDateTime } = useTenantFormat()
  const who = thread.participants.find((p) => p.email !== thread.mailbox.emailAddress)
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        aria-label={t('sales.inbox.select', { subject: thread.subject })}
        data-testid="thread-row"
        className="block w-full space-y-1 p-3 text-left text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-muted"
        onClick={onSelect}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{who?.name ?? who?.email ?? thread.subject}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatRelativeDateTime(thread.lastMessageAt)}
          </span>
        </span>
        <span className="block truncate">{thread.subject}</span>
        <span className="block truncate text-muted-foreground">{thread.snippet}</span>
        <span className="flex flex-wrap items-center gap-1">
          {thread.awaitingReply && (
            <Badge variant="secondary">{t('sales.inbox.awaitingReply')}</Badge>
          )}
          {showAi && <ThreadCategoryBadge thread={thread} />}
          {thread.deal && (
            <Badge variant="outline">{t('sales.inbox.deal', { title: thread.deal.title })}</Badge>
          )}
          {thread.hasAttachments && (
            <PaperclipIcon
              aria-label={t('sales.inbox.attachments')}
              role="img"
              className="size-3.5 text-muted-foreground"
            />
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {t('sales.inbox.messages', { count: thread.messageCount })}
          </span>
        </span>
      </button>
    </li>
  )
}

function SearchBox({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(value)
  const commit = useEffectEvent((next: string) => {
    if (next.trim() !== value.trim()) onCommit(next.trim())
  })
  useEffect(() => {
    const timer = setTimeout(() => {
      commit(text)
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [text])
  return (
    <div className="relative min-w-48 flex-1">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={t('sales.inbox.search')}
        placeholder={t('sales.inbox.search')}
        autoComplete="off"
        className="pl-8"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
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
  const last = Math.max(1, Math.ceil(totalCount / INBOX_PAGE_SIZE))
  return (
    <nav
      aria-label={t('sales.inbox.pagination')}
      className="flex flex-wrap items-center justify-between gap-2"
    >
      <p className="text-xs text-muted-foreground">
        {t('sales.inbox.range', {
          from: (page - 1) * INBOX_PAGE_SIZE + 1,
          to: Math.min(page * INBOX_PAGE_SIZE, totalCount),
          total: totalCount,
        })}
      </p>
      {last > 1 && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              onPage(page - 1)
            }}
          >
            {t('sales.inbox.previous')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= last}
            onClick={() => {
              onPage(page + 1)
            }}
          >
            {t('sales.inbox.next')}
          </Button>
        </div>
      )}
    </nav>
  )
}
