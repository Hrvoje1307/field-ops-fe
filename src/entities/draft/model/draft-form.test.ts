import { describe, expect, it } from 'vitest'

import type { Draft } from '@/shared/api/generated/model'

import {
  buildDraftSchema,
  draftFormValues,
  formatAddresses,
  hasChanges,
  isEditable,
  parseAddresses,
  retryRequest,
  sendingMailboxes,
  toDraftUpdate,
} from './draft-form'

const draft = {
  id: 'd',
  threadId: 't',
  mailboxId: 'm',
  kind: 'reply',
  status: 'ready',
  subject: 'Re: Upit',
  bodyText: 'Poštovani,\nponuda u prilogu.',
  to: [{ email: 'ana@b.hr', name: 'Ana' }],
  cc: [],
  instructions: 'Ponudi utorak.',
  version: 3,
} as unknown as Draft

describe('addresses', () => {
  it('parses plain and named addresses with comma, semicolon or new line', () => {
    expect(parseAddresses('a@b.hr, Ana Anić <ana@b.hr>;\n"Pero" <p@b.hr>')).toEqual({
      addresses: [
        { email: 'a@b.hr' },
        { email: 'ana@b.hr', name: 'Ana Anić' },
        { email: 'p@b.hr', name: 'Pero' },
      ],
      invalid: [],
    })
  })
  it('reports what is not an address', () => {
    expect(parseAddresses('a@b.hr, nije adresa, x@')).toMatchObject({
      invalid: ['nije adresa', 'x@'],
    })
  })
  it('formats them back the way they are typed', () => {
    expect(formatAddresses(draft.to)).toBe('Ana <ana@b.hr>')
    expect(parseAddresses(formatAddresses(draft.to)).addresses).toEqual(draft.to)
  })
})

describe('draft form', () => {
  const schema = buildDraftSchema()
  it('needs a subject, a text and at least one valid recipient', () => {
    expect(schema.safeParse(draftFormValues(draft)).success).toBe(true)
    expect(schema.safeParse({ ...draftFormValues(draft), to: '' }).success).toBe(false)
    expect(schema.safeParse({ ...draftFormValues(draft), cc: 'loše' }).success).toBe(false)
    expect(schema.safeParse({ ...draftFormValues(draft), subject: ' ' }).success).toBe(false)
    expect(schema.safeParse({ ...draftFormValues(draft), bodyText: '' }).success).toBe(false)
  })
  it('sends the version it is given, so an older one is never sent by accident', () => {
    expect(toDraftUpdate(draftFormValues(draft), 7)).toMatchObject({
      version: 7,
      to: draft.to,
      cc: [],
    })
  })
  it('knows when there is something unsaved', () => {
    expect(hasChanges(draftFormValues(draft), draft)).toBe(false)
    expect(hasChanges({ ...draftFormValues(draft), bodyText: 'drugo' }, draft)).toBe(true)
  })
  it('a retry keeps kind, instructions and mailbox', () => {
    expect(retryRequest(draft)).toEqual({
      kind: 'reply',
      instructions: 'Ponudi utorak.',
      mailboxId: 'm',
    })
  })
})

describe('statuses and mailboxes', () => {
  it('only ready, edited and saved drafts can be edited', () => {
    expect(['ready', 'edited', 'saved_to_mailbox'].every((s) => isEditable(s as never))).toBe(true)
    expect(['generating', 'sent', 'discarded', 'failed'].some((s) => isEditable(s as never))).toBe(
      false,
    )
  })
  it('only mailboxes that can send are offered', () => {
    expect(
      sendingMailboxes([
        { canSend: true, id: 1 },
        { canSend: false, id: 2 },
      ]),
    ).toEqual([{ canSend: true, id: 1 }])
  })
})
