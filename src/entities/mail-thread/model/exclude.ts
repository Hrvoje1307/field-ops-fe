import type { MailThread, ThreadExcludeRequest } from '@/shared/api/generated/model'

/**
 * The external sender: whoever wrote the last inbound message (the thread's own mailboxes
 * are never the sender). Falls back to the first participant that is not one of them.
 */
export function externalSender(thread: MailThread): { email: string; name?: string | null } | null {
  const own = new Set(thread.mailboxes.map((mailbox) => mailbox.emailAddress.toLowerCase()))
  const inbound = thread.messages.findLast((message) => message.direction === 'inbound')
  if (inbound && !own.has(inbound.from.email.toLowerCase())) return inbound.from
  return thread.participants.find((person) => !own.has(person.email.toLowerCase())) ?? null
}

export const domainOf = (email: string): string => email.slice(email.lastIndexOf('@'))

export type ExcludeScope = 'address' | 'domain'

/** What the rule matches: the address, or `@domain` for everyone on the domain. */
export function excludePattern(scope: ExcludeScope, email: string): string {
  return scope === 'domain' ? domainOf(email) : email
}

/** Always explicit: the choice is the user's, the API's default is never relied on. */
export function toExcludeBody(
  scope: ExcludeScope,
  email: string,
  purge: boolean,
): ThreadExcludeRequest {
  return { pattern: excludePattern(scope, email), purge }
}
