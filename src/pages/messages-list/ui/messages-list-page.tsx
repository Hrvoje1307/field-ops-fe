import { useTranslation } from 'react-i18next'

import {
  MessageList,
  type MessagesSearch,
  type MessagesSearchChange,
} from '@/features/messages/list'

export function MessagesListPage({
  search,
  onSearchChange,
}: {
  search: MessagesSearch
  onSearchChange: MessagesSearchChange
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('message.list.title')}</h1>
      <MessageList search={search} onSearchChange={onSearchChange} />
    </div>
  )
}
