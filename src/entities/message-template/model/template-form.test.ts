import { describe, expect, it } from 'vitest'

import type { MessageTemplate } from '@/shared/api/generated/model'

import { buildTemplateSchema, templateFormValues, toTemplateBody } from './template-form'

const email: MessageTemplate = {
  id: '1',
  key: 'report_ready',
  channel: 'email',
  locale: 'hr-HR',
  subject: 'Izvještaj',
  body: 'Poštovani {klijent}',
  isActive: true,
  isDefault: true,
}
const sms: MessageTemplate = { ...email, id: '2', channel: 'sms', subject: null }

const messages = (channel: 'sms' | 'email', values: object) => {
  const result = buildTemplateSchema(channel).safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('message template form', () => {
  it('needs a text, and a subject for an e-mail only', () => {
    expect(messages('sms', { subject: '', body: ' ', isActive: true })).toEqual([
      'body: Upišite tekst poruke.',
    ])
    expect(messages('email', { subject: ' ', body: 'x', isActive: true })).toEqual([
      'subject: Upišite naslov e-maila.',
    ])
    expect(messages('sms', { subject: '', body: 'x', isActive: true })).toEqual([])
  })

  it('opens with what the template has', () => {
    expect(templateFormValues(email)).toEqual({
      subject: 'Izvještaj',
      body: 'Poštovani {klijent}',
      isActive: true,
    })
    expect(templateFormValues(sms).subject).toBe('')
  })

  it('keeps key, channel and language, and sends no subject with an SMS', () => {
    const values = { subject: ' Naslov ', body: ' Tekst ', isActive: false }
    expect(toTemplateBody(email, values)).toEqual({
      key: 'report_ready',
      channel: 'email',
      locale: 'hr-HR',
      subject: 'Naslov',
      body: 'Tekst',
      isActive: false,
    })
    expect(toTemplateBody(sms, values)).toMatchObject({ channel: 'sms', subject: null })
  })
})
