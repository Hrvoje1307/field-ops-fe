import type { Contact, MessageChannel } from '@/shared/api/generated/model'

/** Whether a message by this channel can go to the contact at all. */
export function canReach(contact: Pick<Contact, 'phone' | 'email'>, channel: MessageChannel) {
  return channel === 'sms' ? Boolean(contact.phone) : Boolean(contact.email)
}

/** Where an SMS or an e-mail of this channel goes: the address or number of the contact. */
export function addressOf(contact: Pick<Contact, 'phone' | 'email'>, channel: MessageChannel) {
  return (channel === 'sms' ? contact.phone : contact.email) ?? ''
}

/**
 * Who a message goes to: the chosen contact, or without a choice everyone who can be
 * reached by that channel (and, for SMS, wants texts).
 */
export function recipientsOf<T extends Pick<Contact, 'id' | 'phone' | 'email' | 'receivesSms'>>(
  contacts: readonly T[],
  channel: MessageChannel,
  contactId: string,
): T[] {
  if (contactId !== '') return contacts.filter((contact) => contact.id === contactId)
  return contacts.filter(
    (contact) => canReach(contact, channel) && (channel !== 'sms' || contact.receivesSms),
  )
}
