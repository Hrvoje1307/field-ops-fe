import { describe, expect, it } from 'vitest'

import type { Mailbox } from '@/shared/api/generated/model'

import {
  buildImapSchema,
  imapFormValues,
  toImapBody,
  toMailboxUpdate,
  toOAuthStartBody,
  toReconnectBody,
} from './mailbox-forms'

const mailbox: Mailbox = {
  id: 'm1',
  provider: 'gmail',
  emailAddress: 'info@firma.test',
  displayName: 'Info',
  kind: 'shared',
  owner: null,
  status: 'needs_reauth',
  syncFrom: '2026-08-01',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
}
const filled = {
  ...imapFormValues(),
  emailAddress: 'a@b.test',
  imapHost: 'imap.b.test',
  smtpHost: 'smtp.b.test',
  username: 'a@b.test',
  password: 'tajna',
}

describe('IMAP form', () => {
  it('needs hosts, ports, a username and a password; a personal mailbox needs an owner', () => {
    const schema = buildImapSchema()
    expect(schema.safeParse(filled).success).toBe(true)
    expect(schema.safeParse({ ...filled, password: '' }).success).toBe(false)
    expect(schema.safeParse({ ...filled, imapPort: '70000' }).success).toBe(false)
    expect(schema.safeParse({ ...filled, smtpHost: ' ' }).success).toBe(false)
    expect(schema.safeParse({ ...filled, kind: 'personal' }).success).toBe(false)
    expect(schema.safeParse({ ...filled, kind: 'personal', ownerUserId: 'u1' }).success).toBe(true)
  })
  it('sends ports as numbers, the owner only for a personal mailbox, and an optional start date', () => {
    expect(toImapBody(filled)).toMatchObject({ imapPort: 993, smtpPort: 587, kind: 'shared' })
    expect(toImapBody(filled)).not.toHaveProperty('ownerUserId')
    expect(toImapBody(filled)).not.toHaveProperty('syncFrom')
    expect(
      toImapBody({ ...filled, kind: 'personal', ownerUserId: 'u1', syncFrom: '2026-09-01' }),
    ).toMatchObject({
      ownerUserId: 'u1',
      syncFrom: '2026-09-01',
    })
  })
  it('a reconnect starts from what the API tells and never fills the password', () => {
    const values = imapFormValues({ ...mailbox, provider: 'imap' })
    expect(values).toMatchObject({
      emailAddress: 'info@firma.test',
      displayName: 'Info',
      kind: 'shared',
      password: '',
    })
    expect(values.imapHost).toBe('')
  })
})

describe('OAuth bodies', () => {
  it('starts with provider and kind, the owner for a personal one, an optional date', () => {
    expect(toOAuthStartBody('gmail', { kind: 'shared', ownerUserId: '', syncFrom: '' })).toEqual({
      provider: 'gmail',
      kind: 'shared',
    })
    expect(
      toOAuthStartBody('microsoft', {
        kind: 'personal',
        ownerUserId: 'u1',
        syncFrom: '2026-09-01',
      }),
    ).toEqual({
      provider: 'microsoft',
      kind: 'personal',
      ownerUserId: 'u1',
      syncFrom: '2026-09-01',
    })
  })
  it('a reconnect sends the mailbox id with its own kind and owner', () => {
    expect(toReconnectBody({ ...mailbox, provider: 'gmail' })).toEqual({
      provider: 'gmail',
      kind: 'shared',
      mailboxId: 'm1',
    })
    expect(
      toReconnectBody({
        ...mailbox,
        provider: 'microsoft',
        kind: 'personal',
        owner: { id: 'u1', fullName: 'X' },
      }),
    ).toMatchObject({ ownerUserId: 'u1', mailboxId: 'm1' })
  })
})

describe('toMailboxUpdate', () => {
  it('pauses and resumes, keeping name, kind and owner', () => {
    expect(toMailboxUpdate(mailbox, { isActive: false })).toEqual({
      displayName: 'Info',
      kind: 'shared',
      isActive: false,
    })
    expect(toMailboxUpdate({ ...mailbox, status: 'disabled' }, {})).toMatchObject({
      isActive: false,
    })
    expect(toMailboxUpdate({ ...mailbox, status: 'disabled' }, { isActive: true })).toMatchObject({
      isActive: true,
    })
  })
  it('a personal mailbox keeps its owner', () => {
    expect(
      toMailboxUpdate(
        { ...mailbox, kind: 'personal', owner: { id: 'u1', fullName: 'X' } },
        { displayName: 'Nova' },
      ),
    ).toEqual({ displayName: 'Nova', kind: 'personal', ownerUserId: 'u1', isActive: true })
  })
})
