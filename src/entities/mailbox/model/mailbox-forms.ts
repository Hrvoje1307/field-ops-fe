import { z } from 'zod'

import type {
  ImapMailboxCreate,
  Mailbox,
  MailboxKind,
  MailboxOAuthStartRequest,
  MailboxUpdate,
  MailSecurity,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'
import { isPlainDate } from '@/shared/lib/datetime'

const text = () => z.string().trim()
const orNull = (value: string) => (value === '' ? null : value)

const port = (message: string) =>
  text().refine(
    (value) => /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= 65535,
    message,
  )
const optionalDate = (message: string) =>
  z.string().refine((value) => value === '' || isPlainDate(value), message)

/** Usual ports of the two ways of securing a connection (a convention of mail, not of a tenant). */
export const DEFAULT_IMAP_PORT: Record<MailSecurity, string> = { ssl: '993', starttls: '143' }
export const DEFAULT_SMTP_PORT: Record<MailSecurity, string> = { ssl: '465', starttls: '587' }

export interface ImapFormValues {
  emailAddress: string
  displayName: string
  kind: MailboxKind
  /** A user of the tenant; only for a personal mailbox. */
  ownerUserId: string
  imapHost: string
  imapPort: string
  imapSecurity: MailSecurity
  smtpHost: string
  smtpPort: string
  smtpSecurity: MailSecurity
  username: string
  /** Never stored or shown by the API; always typed. */
  password: string
  syncFrom: string
}

/** The IMAP form; paths mirror `ImapMailboxCreate`. */
export function buildImapSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      emailAddress: text().pipe(z.email(t('sales.mailboxes.errors.emailInvalid'))),
      displayName: text(),
      kind: z.enum(['shared', 'personal']),
      ownerUserId: z.string(),
      imapHost: text().min(1, t('sales.mailboxes.errors.hostRequired')),
      imapPort: port(t('sales.mailboxes.errors.portInvalid')),
      imapSecurity: z.enum(['ssl', 'starttls']),
      smtpHost: text().min(1, t('sales.mailboxes.errors.hostRequired')),
      smtpPort: port(t('sales.mailboxes.errors.portInvalid')),
      smtpSecurity: z.enum(['ssl', 'starttls']),
      username: text().min(1, t('sales.mailboxes.errors.usernameRequired')),
      password: z.string().min(1, t('sales.mailboxes.errors.passwordRequired')),
      syncFrom: optionalDate(t('sales.mailboxes.errors.dateInvalid')),
    })
    .superRefine((value, ctx) => {
      if (value.kind === 'personal' && !value.ownerUserId) {
        ctx.addIssue({
          code: 'custom',
          path: ['ownerUserId'],
          message: t('sales.mailboxes.errors.ownerRequired'),
        })
      }
    })
}

/**
 * An empty form, or the start of a reconnect: only what the API tells about the mailbox is
 * filled (address, name, kind, owner). The servers and the username are not in `Mailbox`,
 * and the password is never filled.
 */
export function imapFormValues(mailbox?: Mailbox, ownerFallback = ''): ImapFormValues {
  return {
    emailAddress: mailbox?.emailAddress ?? '',
    displayName: mailbox?.displayName ?? '',
    kind: mailbox?.kind ?? 'shared',
    ownerUserId: mailbox?.owner?.id ?? ownerFallback,
    imapHost: '',
    imapPort: DEFAULT_IMAP_PORT.ssl,
    imapSecurity: 'ssl',
    smtpHost: '',
    smtpPort: DEFAULT_SMTP_PORT.starttls,
    smtpSecurity: 'starttls',
    username: mailbox?.emailAddress ?? '',
    password: '',
    syncFrom: mailbox?.syncFrom ?? '',
  }
}

export function toImapBody(values: ImapFormValues): ImapMailboxCreate {
  return {
    emailAddress: values.emailAddress,
    displayName: orNull(values.displayName),
    kind: values.kind,
    ...(values.kind === 'personal' ? { ownerUserId: values.ownerUserId } : {}),
    imapHost: values.imapHost,
    imapPort: Number(values.imapPort),
    imapSecurity: values.imapSecurity,
    smtpHost: values.smtpHost,
    smtpPort: Number(values.smtpPort),
    smtpSecurity: values.smtpSecurity,
    username: values.username,
    password: values.password,
    ...(values.syncFrom ? { syncFrom: values.syncFrom } : {}),
  }
}

export interface OAuthFormValues {
  kind: MailboxKind
  ownerUserId: string
  syncFrom: string
}

export function buildOAuthSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      kind: z.enum(['shared', 'personal']),
      ownerUserId: z.string(),
      syncFrom: optionalDate(t('sales.mailboxes.errors.dateInvalid')),
    })
    .superRefine((value, ctx) => {
      if (value.kind === 'personal' && !value.ownerUserId) {
        ctx.addIssue({
          code: 'custom',
          path: ['ownerUserId'],
          message: t('sales.mailboxes.errors.ownerRequired'),
        })
      }
    })
}

export function toOAuthStartBody(
  provider: 'gmail' | 'microsoft',
  values: OAuthFormValues,
): MailboxOAuthStartRequest {
  return {
    provider,
    kind: values.kind,
    ...(values.kind === 'personal' ? { ownerUserId: values.ownerUserId } : {}),
    ...(values.syncFrom ? { syncFrom: values.syncFrom } : {}),
  }
}

/** Re-authorising a mailbox in `needs_reauth` / `error`: the same kind and owner, with its id. */
export function toReconnectBody(
  mailbox: Mailbox & { provider: 'gmail' | 'microsoft' },
): MailboxOAuthStartRequest {
  return {
    provider: mailbox.provider,
    kind: mailbox.kind,
    ...(mailbox.owner ? { ownerUserId: mailbox.owner.id } : {}),
    mailboxId: mailbox.id,
  }
}

export function isOAuthMailbox(
  mailbox: Mailbox,
): mailbox is Mailbox & { provider: 'gmail' | 'microsoft' } {
  return mailbox.provider !== 'imap'
}

/** `MailboxUpdate` for a rename, a change of kind or owner, or pausing and resuming. */
export function toMailboxUpdate(
  mailbox: Mailbox,
  change: Partial<{
    displayName: string
    kind: MailboxKind
    ownerUserId: string | null
    isActive: boolean
  }>,
): MailboxUpdate {
  const kind = change.kind ?? mailbox.kind
  const ownerUserId = change.ownerUserId ?? mailbox.owner?.id ?? null
  return {
    displayName: change.displayName ?? mailbox.displayName,
    kind,
    ...(kind === 'personal' && ownerUserId ? { ownerUserId } : {}),
    isActive: change.isActive ?? mailbox.status !== 'disabled',
  }
}
