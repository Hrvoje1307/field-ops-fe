import { z } from 'zod'

import type {
  MessageChannel,
  MessageTemplateKey,
  NotifyClientBody,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface NotifyFormValues {
  channel: MessageChannel
  /** A template of the tenant's, or text written for this once. */
  source: 'template' | 'text'
  /** A key of the contract, or empty before one is chosen. */
  templateKey: string
  body: string
  /** Empty for everyone who can be reached. */
  contactId: string
}

export const emptyNotify: NotifyFormValues = {
  channel: 'sms',
  source: 'template',
  templateKey: '',
  body: '',
  contactId: '',
}

export function buildNotifySchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      channel: z.enum(['sms', 'email']),
      source: z.enum(['template', 'text']),
      templateKey: z.string(),
      body: z.string(),
      contactId: z.string(),
    })
    .superRefine((values, context) => {
      if (values.source === 'template' && values.templateKey === '') {
        context.addIssue({
          code: 'custom',
          path: ['templateKey'],
          message: t('message.errors.templateRequired'),
        })
      }
      if (values.source === 'text' && values.body.trim() === '') {
        context.addIssue({
          code: 'custom',
          path: ['body'],
          message: t('message.errors.bodyRequired'),
        })
      }
    })
}

/** A template is sent by its key and has no text of its own to send; free text has no key. */
export function toNotifyBody(values: NotifyFormValues): NotifyClientBody {
  return {
    channel: values.channel,
    ...(values.source === 'template' && values.templateKey !== ''
      ? { templateKey: values.templateKey as MessageTemplateKey }
      : { body: values.body.trim() }),
    ...(values.contactId === '' ? {} : { contactId: values.contactId }),
  }
}
