import type { MessageTemplateInput } from '@/shared/api/generated/model'

import { OFFICE_ROLES } from '../lib/access'
import { newId } from '../lib/ids'
import { placeholderValues } from '../lib/messages'
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
    ({ db, auth, body }) => {
      const job = body.jobId
        ? auth.t.jobs.find((j) => j.id === body.jobId && !j.deletedAt)
        : undefined
      if (body.jobId && !job) throw notFound()
      // With a job, what its client would get (the link is the page the message would carry)
      const values = job
        ? placeholderValues(
            db,
            auth.t,
            job,
            auth.t.contacts.find((c) => c.clientId === job.clientId && c.isPrimary && !c.deletedAt),
            job.publicToken ?? 'preview',
          )
        : undefined
      const { rendered, unknown } = renderBody(body.body, values)
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
