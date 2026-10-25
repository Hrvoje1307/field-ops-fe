import type { MessageTemplateInput } from '@/shared/api/generated/model'

import { OFFICE_ROLES } from '../lib/access'
import { newId } from '../lib/ids'
import { effectiveTemplates, renderBody, smsSegments } from '../lib/message-templates'
import { conflict, created, FieldErrors, MESSAGES, noContent, notFound, ok } from '../lib/problems'
import { route } from '../lib/route'

/** 400s on the body (and on the subject an e-mail needs). */
function validate(body: MessageTemplateInput): void {
  const errors = new FieldErrors()
  if (body.body.trim() === '') errors.add('body', MESSAGES.required)
  if (body.channel === 'email' && (body.subject ?? '').trim() === '') {
    errors.add('subject', MESSAGES.required)
  }
  errors.throwIfAny()
}

export const messageTemplateHandlers = [
  route('get', '/message-templates', ({ auth }) => ok(effectiveTemplates(auth.t)), {
    roles: OFFICE_ROLES,
  }),

  route<MessageTemplateInput>(
    'post',
    '/message-templates',
    ({ auth, body }) => {
      validate(body)
      const taken = auth.t.messageTemplates.some(
        (m) => m.key === body.key && m.channel === body.channel && m.locale === body.locale,
      )
      if (taken) {
        throw conflict('message_template.exists', 'The tenant already has this template.')
      }
      const template = {
        id: newId(),
        key: body.key,
        channel: body.channel,
        locale: body.locale,
        subject: body.channel === 'email' ? (body.subject ?? null) : null,
        body: body.body,
        isActive: body.isActive,
        isDefault: false,
      }
      auth.t.messageTemplates.push(template)
      return created(template)
    },
    { roles: OFFICE_ROLES },
  ),

  route<{ body: string; jobId?: string }>(
    'post',
    '/message-templates/preview',
    ({ auth, body }) => {
      if (body.jobId && !auth.t.jobs.some((j) => j.id === body.jobId && !j.deletedAt)) {
        throw notFound()
      }
      const { rendered, unknown } = renderBody(body.body)
      const { length, segments } = smsSegments(rendered)
      return ok({ rendered, length, smsSegments: segments, unknownPlaceholders: unknown })
    },
    { roles: OFFICE_ROLES },
  ),

  route<MessageTemplateInput>(
    'put',
    '/message-templates/{id}',
    ({ auth, body, params }) => {
      // The platform defaults are not the tenant's to change: it writes its own instead
      const index = auth.t.messageTemplates.findIndex((m) => m.id === params.id)
      const current = auth.t.messageTemplates[index]
      if (!current) throw notFound()
      validate(body)
      const taken = auth.t.messageTemplates.some(
        (m) =>
          m.id !== current.id &&
          m.key === body.key &&
          m.channel === body.channel &&
          m.locale === body.locale,
      )
      if (taken) {
        throw conflict('message_template.exists', 'The tenant already has this template.')
      }
      const template = {
        id: current.id,
        key: body.key,
        channel: body.channel,
        locale: body.locale,
        subject: body.channel === 'email' ? (body.subject ?? null) : null,
        body: body.body,
        isActive: body.isActive,
        isDefault: false,
      }
      auth.t.messageTemplates[index] = template
      return ok(template)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/message-templates/{id}',
    ({ auth, params }) => {
      if (!auth.t.messageTemplates.some((m) => m.id === params.id)) throw notFound()
      // The platform default shows again in its place
      auth.t.messageTemplates = auth.t.messageTemplates.filter((m) => m.id !== params.id)
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),
]
