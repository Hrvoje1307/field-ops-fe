export type {
  DeleteMailboxParams,
  ImapMailboxCreate,
  Mailbox,
  MailboxKind,
  MailboxOAuthStartRequest,
  MailboxOAuthStartResponse,
  MailboxStatus,
  MailboxUpdate,
  MailProvider,
  MailSecurity,
} from '@/shared/api/generated/model'
export {
  createImapMailbox,
  deleteMailbox,
  listMailboxes,
  mailboxKeys,
  startMailboxOAuth,
  syncMailbox,
  updateMailbox,
  useCreateImapMailbox,
  useDeleteMailbox,
  useListMailboxes,
  useRefreshMailboxes,
  useStartMailboxOAuth,
  useSyncMailbox,
  useUpdateMailbox,
} from './api'
export {
  buildImapSchema,
  buildOAuthSchema,
  DEFAULT_IMAP_PORT,
  DEFAULT_SMTP_PORT,
  imapFormValues,
  type ImapFormValues,
  isOAuthMailbox,
  type OAuthFormValues,
  toImapBody,
  toMailboxUpdate,
  toOAuthStartBody,
  toReconnectBody,
} from './model/mailbox-forms'
export {
  OAUTH_ERROR_CODES,
  type OAuthErrorCode,
  type OAuthReturn,
  readOAuthReturn,
} from './model/oauth-return'
export { MailboxKindFields, type MailboxOwner } from './ui/mailbox-kind-fields'
export { MailboxStatusBadge } from './ui/mailbox-status-badge'
