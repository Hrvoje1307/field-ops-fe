import { dealFormValues, type DealFormValues } from '@/entities/deal'
import { externalSender, type MailThread } from '@/entities/mail-thread'

/**
 * The start of a deal made from a conversation: its subject as the title, and the contact
 * from what the AI extracted, else from the sender. The person confirms or changes all of it.
 */
export function dealFromThread(
  thread: MailThread,
  formatPhone: (e164: string) => string = (phone) => phone,
): DealFormValues {
  const extracted = thread.classification?.extracted
  const sender = externalSender(thread)
  return {
    ...dealFormValues(),
    title: thread.subject.slice(0, 200),
    contactName: extracted?.name ?? sender?.name ?? '',
    contactEmail: extracted?.email ?? sender?.email ?? '',
    contactPhone: extracted?.phone ? formatPhone(extracted.phone) : '',
    value: extracted?.budget ? extracted.budget.replace('.', ',') : '',
    notes: extracted?.request ?? '',
  }
}
