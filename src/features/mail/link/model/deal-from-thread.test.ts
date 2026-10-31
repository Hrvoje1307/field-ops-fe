import { describe, expect, it } from 'vitest'

import type { MailThread } from '@/shared/api/generated/model'

import { dealFromThread } from './deal-from-thread'

const base = {
  subject: 'Zanima me nadzor',
  participants: [{ email: 'info@firma.test' }, { email: 'a@b.test', name: 'Ana' }],
  mailboxes: [{ id: 'm', emailAddress: 'info@firma.test', kind: 'shared', canSend: true }],
  messages: [{ direction: 'inbound', from: { email: 'a@b.test', name: 'Ana' } }],
} as unknown as MailThread

describe('dealFromThread', () => {
  it('starts from the subject and the sender', () => {
    expect(dealFromThread(base)).toMatchObject({
      title: 'Zanima me nadzor',
      contactName: 'Ana',
      contactEmail: 'a@b.test',
      contactPhone: '',
      stageId: '',
    })
  })
  it('prefers what the AI extracted; the amount keeps its digits, the phone is shown nationally', () => {
    const thread = {
      ...base,
      classification: {
        category: 'new_inquiry',
        source: 'ai',
        isSales: true,
        extracted: {
          name: 'Ana Anić',
          email: 'ana@firma2.test',
          phone: '+385911234567',
          budget: '2500.50',
          request: 'Video nadzor za pekaru',
        },
      },
    } as unknown as MailThread
    expect(dealFromThread(thread, (p) => `0${p.slice(4)}`)).toMatchObject({
      contactName: 'Ana Anić',
      contactEmail: 'ana@firma2.test',
      contactPhone: '0911234567',
      value: '2500,50',
      notes: 'Video nadzor za pekaru',
    })
  })
})
