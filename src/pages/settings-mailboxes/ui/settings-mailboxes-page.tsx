import { MailboxesSettings } from '@/widgets/mailboxes-settings'

export function SettingsMailboxesPage({
  search,
  onClearSearch,
}: {
  search: { connected?: string | undefined; error?: string | undefined }
  onClearSearch: () => void
}) {
  return <MailboxesSettings search={search} onClearSearch={onClearSearch} />
}
