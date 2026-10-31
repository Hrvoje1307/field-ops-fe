import { z } from 'zod'

import type {
  Draft,
  DraftCreateRequest,
  DraftStatus,
  DraftUpdate,
  MailAddress,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

/** What a person may still edit: a draft that is ready, was edited, or already sits in the mailbox. */
export const EDITABLE_STATUSES: readonly DraftStatus[] = ['ready', 'edited', 'saved_to_mailbox']

export const isEditable = (status: DraftStatus): boolean => EDITABLE_STATUSES.includes(status)

export const INSTRUCTIONS_MAX = 1000

const EMAIL = z.email()

/**
 * Addresses typed in one line (or several): `a@b.hr, Ana <ana@b.hr>`. Separators are comma,
 * semicolon and new line. `invalid` are the pieces that are not an address.
 */
export function parseAddresses(text: string): { addresses: MailAddress[]; invalid: string[] } {
  const addresses: MailAddress[] = []
  const invalid: string[] = []
  for (const piece of text.split(/[,;\n]/)) {
    const part = piece.trim()
    if (!part) continue
    const named = /^(.*?)\s*<([^<>]+)>$/.exec(part)
    const email = (named?.[2] ?? part).trim()
    const name = named?.[1]?.trim().replace(/^"|"$/g, '')
    if (!EMAIL.safeParse(email).success) invalid.push(part)
    else addresses.push(name ? { email, name } : { email })
  }
  return { addresses, invalid }
}

export function formatAddresses(addresses: readonly MailAddress[]): string {
  return addresses
    .map((address) => (address.name ? `${address.name} <${address.email}>` : address.email))
    .join(', ')
}

export interface DraftFormValues {
  subject: string
  bodyText: string
  to: string
  cc: string
}

/** The editor's form; `to` needs at least one address, every address has to be valid. */
export function buildDraftSchema() {
  const t = i18n.t.bind(i18n)
  const list = (min: number) =>
    z.string().superRefine((value, ctx) => {
      const { addresses, invalid } = parseAddresses(value)
      if (invalid.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: t('sales.draft.errors.addressInvalid', { value: invalid.join(', ') }),
        })
      } else if (addresses.length < min) {
        ctx.addIssue({ code: 'custom', message: t('sales.draft.errors.toRequired') })
      }
    })
  return z.object({
    subject: z.string().trim().min(1, t('sales.draft.errors.subjectRequired')),
    bodyText: z.string().trim().min(1, t('sales.draft.errors.bodyRequired')),
    to: list(1),
    cc: list(0),
  })
}

export function draftFormValues(draft: Draft): DraftFormValues {
  return {
    subject: draft.subject,
    bodyText: draft.bodyText,
    to: formatAddresses(draft.to),
    cc: formatAddresses(draft.cc),
  }
}

/** `DraftUpdate` with the draft's version at the moment of saving (never an older one). */
export function toDraftUpdate(values: DraftFormValues, version: number): DraftUpdate {
  return {
    subject: values.subject.trim(),
    bodyText: values.bodyText,
    to: parseAddresses(values.to).addresses,
    cc: parseAddresses(values.cc).addresses,
    version,
  }
}

export function hasChanges(values: DraftFormValues, draft: Draft): boolean {
  const saved = draftFormValues(draft)
  return (
    values.subject !== saved.subject ||
    values.bodyText !== saved.bodyText ||
    values.to.trim() !== saved.to ||
    values.cc.trim() !== saved.cc
  )
}

/** A new draft with the same kind, instructions and mailbox: "Pokušaj ponovno" after a failure. */
export function retryRequest(draft: Draft): DraftCreateRequest {
  return {
    kind: draft.kind,
    ...(draft.instructions ? { instructions: draft.instructions } : {}),
    mailboxId: draft.mailboxId,
  }
}

/** Mailboxes a draft can be made for and sent from: the thread's own that can send. */
export function sendingMailboxes<T extends { canSend: boolean }>(mailboxes: readonly T[]): T[] {
  return mailboxes.filter((mailbox) => mailbox.canSend)
}
