import type { ListMessagesParams, NotifyClientBody } from '@/shared/api/generated/model'

import { getVisibleJob, OFFICE_ROLES, viewerOf } from '../lib/access'
import { effectiveTemplates, renderBody } from '../lib/message-templates'
import { ensurePublicToken, newMessage, placeholderValues, presentMessage } from '../lib/messages'
import { FieldErrors, MESSAGES, ok, unprocessable } from '../lib/problems'
import { PLAN_FEATURES } from '../lib/present'
import { route } from '../lib/route'

export const messageHandlers = [
  route<undefined, ListMessagesParams>(
    'get',
    '/messages',
    ({ auth, query }) => {
      const now = Date.now()
      const rows = auth.t.messages
        .map((row) => presentMessage(row, now))
        .filter((message) => !query.jobId || message.jobId === query.jobId)
        .filter((message) => !query.status || message.status === query.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 50
      return ok({
        page,
        pageSize,
        totalCount: rows.length,
        items: rows.slice((page - 1) * pageSize, page * pageSize),
      })
    },
    { roles: OFFICE_ROLES },
  ),

  route<NotifyClientBody>(
    'post',
    '/jobs/{id}/notify',
    ({ db, auth, body, params }) => {
      const t = auth.t
      const job = getVisibleJob(t, viewerOf(auth), params.id)

      const errors = new FieldErrors()
      if (!body.templateKey && (body.body ?? '').trim() === '') {
        errors.add('body', MESSAGES.required)
      }
      const contactPool = t.contacts.filter((c) => c.clientId === job.clientId && !c.deletedAt)
      const chosen = body.contactId ? contactPool.find((c) => c.id === body.contactId) : undefined
      if (body.contactId && !chosen) errors.add('contactId', MESSAGES.notFound)
      errors.throwIfAny()

      const jobType = t.jobTypes.find((type) => type.id === job.jobTypeId)
      if (
        body.channel === 'sms' &&
        (!PLAN_FEATURES[t.tenant.plan]?.includes('sms') || jobType?.smsEnabled === false)
      ) {
        throw unprocessable(
          'notify.sms_disabled',
          'SMS is switched off for this tenant or job type.',
        )
      }

      const reachable = (contact: (typeof contactPool)[number]) =>
        body.channel === 'sms' ? Boolean(contact.phone) : Boolean(contact.email)
      const recipients = chosen
        ? [chosen]
        : contactPool.filter(
            (contact) => reachable(contact) && (body.channel !== 'sms' || contact.receivesSms),
          )
      if (recipients.length === 0 || !recipients.every(reachable)) {
        throw unprocessable(
          'notify.no_recipient',
          'No contact with a phone number (SMS) or an e-mail address to send to.',
        )
      }

      const template = body.templateKey
        ? effectiveTemplates(t).find(
            (candidate) => candidate.key === body.templateKey && candidate.channel === body.channel,
          )
        : undefined
      if (body.templateKey && !template?.isActive) {
        throw unprocessable('notify.no_template', 'There is no active template for this message.')
      }

      const token = ensurePublicToken(t, job)
      const rows = recipients.map((contact) => {
        const values = placeholderValues(db, t, job, contact, token)
        const text = renderBody(template?.body ?? body.body ?? '', values).rendered
        const subject =
          body.channel === 'email'
            ? renderBody(template?.subject ?? `Nalog ${job.number}`, values).rendered
            : null
        return newMessage(t, {
          jobId: job.id,
          channel: body.channel,
          templateKey: body.templateKey ?? null,
          to: (body.channel === 'sms' ? contact.phone : contact.email) ?? '',
          subject,
          body: text,
        })
      })
      return { status: 202, body: rows.map((row) => presentMessage(row)) }
    },
    { roles: OFFICE_ROLES },
  ),
]
