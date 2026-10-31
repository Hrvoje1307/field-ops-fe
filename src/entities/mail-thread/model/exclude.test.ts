import { describe, expect, it } from 'vitest'

import type { MailThread } from '@/shared/api/generated/model'

import { domainOf, externalSender, toExcludeBody } from './exclude'

const thread = {
  participants: [{ email: 'info@firma.test' }, { email: 'klijent@kupac.test', name: 'Klijent' }],
  mailboxes: [{ id: 'm', emailAddress: 'info@firma.test', kind: 'shared', canSend: true }],
  messages: [
    { direction: 'inbound', from: { email: 'klijent@kupac.test', name: 'Klijent' } },
    { direction: 'outbound', from: { email: 'info@firma.test' } },
  ],
} as unknown as MailThread

describe('exclusion', () => {
  it('the sender is the last inbound author, never one of our mailboxes', () => {
    expect(externalSender(thread)?.email).toBe('klijent@kupac.test')
    expect(externalSender({ ...thread, messages: [] })?.email).toBe('klijent@kupac.test')
  })
  it('sends an explicit pattern and an explicit purge, for an address or a whole domain', () => {
    expect(toExcludeBody('address', 'klijent@kupac.test', true)).toEqual({
      pattern: 'klijent@kupac.test',
      purge: true,
    })
    expect(toExcludeBody('domain', 'klijent@kupac.test', false)).toEqual({
      pattern: '@kupac.test',
      purge: false,
    })
    expect(domainOf('a@b.c.test')).toBe('@b.c.test')
  })
})
