import { z } from 'zod'

import type {
  MessageChannel,
  MessageTemplate,
  MessageTemplateInput,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export interface TemplateFormValues {
  /** E-mail only. */
  subject: string
  body: string
  isActive: boolean
}

export function buildTemplateSchema(channel: MessageChannel) {
  const t = i18n.t.bind(i18n)
  return z.object({
    subject:
      channel === 'email'
        ? z.string().trim().min(1, t('settings.messages.errors.subjectRequired'))
        : z.string(),
    body: z.string().trim().min(1, t('settings.messages.errors.bodyRequired')),
    isActive: z.boolean(),
  })
}

export function templateFormValues(template: MessageTemplate): TemplateFormValues {
  return {
    subject: template.subject ?? '',
    body: template.body,
    isActive: template.isActive,
  }
}

/**
 * The request for a template: its key, channel and language stay as they are; an SMS has
 * no subject. The same body whether the tenant writes its own over a platform default
 * (POST) or changes one it already has (PUT).
 */
export function toTemplateBody(
  template: Pick<MessageTemplate, 'key' | 'channel' | 'locale'>,
  values: TemplateFormValues,
): MessageTemplateInput {
  return {
    key: template.key,
    channel: template.channel,
    locale: template.locale,
    subject: template.channel === 'email' ? values.subject.trim() : null,
    body: values.body.trim(),
    isActive: values.isActive,
  }
}
