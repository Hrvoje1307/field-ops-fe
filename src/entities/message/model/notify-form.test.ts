import { describe, expect, it } from 'vitest'

import { buildNotifySchema, emptyNotify, type NotifyFormValues, toNotifyBody } from './notify-form'

const messages = (change: Partial<NotifyFormValues>) => {
  const result = buildNotifySchema().safeParse({ ...emptyNotify, ...change })
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('notify form', () => {
  it('a template needs choosing, free text needs saying', () => {
    expect(messages({})).toEqual(['templateKey: Odaberite vrstu poruke.'])
    expect(messages({ templateKey: 'on_the_way' })).toEqual([])
    expect(messages({ source: 'text', body: '  ' })).toEqual(['body: Upišite tekst poruke.'])
    expect(messages({ source: 'text', body: 'Dobar dan.' })).toEqual([])
  })

  it('sends a template by its key and free text as text, never both', () => {
    expect(
      toNotifyBody({ ...emptyNotify, templateKey: 'on_the_way', body: 'ostalo od prije' }),
    ).toEqual({ channel: 'sms', templateKey: 'on_the_way' })
    expect(
      toNotifyBody({ ...emptyNotify, source: 'text', templateKey: 'on_the_way', body: ' Bok ' }),
    ).toEqual({ channel: 'sms', body: 'Bok' })
  })

  it('names the contact only when one was chosen', () => {
    expect(
      toNotifyBody({
        ...emptyNotify,
        channel: 'email',
        templateKey: 'report_ready',
        contactId: 'c1',
      }),
    ).toEqual({ channel: 'email', templateKey: 'report_ready', contactId: 'c1' })
  })
})
