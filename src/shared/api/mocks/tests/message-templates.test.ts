import { beforeEach, describe, expect, it } from 'vitest'

import type { MessageTemplate } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { loginAs, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

interface Preview {
  rendered: string
  length: number
  smsSegments: number
  unknownPlaceholders: string[]
}

const sms = (body: string) => ({
  key: 'reschedule_ack',
  channel: 'sms',
  locale: 'hr-HR',
  body,
  isActive: true,
})

describe('message templates', () => {
  it('are for the office, not technicians', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const ivan = await loginAs(USERS.ivan)
    expect((await dispatcher.get('/message-templates')).status).toBe(200)
    expect((await ivan.get('/message-templates')).status).toBe(403)
    expect((await ivan.post('/message-templates/preview', { body: 'x' })).status).toBe(403)
  })

  it('list the tenant’s own and the platform default for every key and channel it has none for', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const mine = (await owner.get<MessageTemplate[]>('/message-templates')).body
    const theirs = (await bura.get<MessageTemplate[]>('/message-templates')).body

    // Alarmko customised "on the way" by SMS; Bura has not customised anything
    const onTheWay = mine.filter((m) => m.key === 'on_the_way' && m.channel === 'sms')
    expect(onTheWay).toHaveLength(1)
    expect(onTheWay[0]?.isDefault).toBe(false)
    expect(theirs.every((m) => m.isDefault)).toBe(true)
    expect(mine.length).toBe(theirs.length)
    // One per key and channel
    const pairs = mine.map((m) => `${m.key}/${m.channel}`)
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('writing over a default makes the tenant’s own, and deleting it brings the default back', async () => {
    const owner = await loginAs(USERS.buraOwner)
    const before = (await owner.get<MessageTemplate[]>('/message-templates')).body
    const created = await owner.post<MessageTemplate>(
      '/message-templates',
      sms('Novi tekst {datum}'),
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      isDefault: false,
      body: 'Novi tekst {datum}',
      subject: null,
    })

    const during = (await owner.get<MessageTemplate[]>('/message-templates')).body
    expect(during).toHaveLength(before.length)
    const own = during.find((m) => m.key === 'reschedule_ack' && m.channel === 'sms')
    expect(own?.id).toBe(created.body.id)

    expect((await owner.del(`/message-templates/${created.body.id}`)).status).toBe(204)
    const after = (await owner.get<MessageTemplate[]>('/message-templates')).body
    expect(after.find((m) => m.key === 'reschedule_ack' && m.channel === 'sms')).toMatchObject({
      isDefault: true,
    })
  })

  it('a second template for the same key, channel and locale is a 409', async () => {
    const owner = await loginAs(USERS.buraOwner)
    expect((await owner.post('/message-templates', sms('Prvi'))).status).toBe(201)
    expect((await owner.post('/message-templates', sms('Drugi'))).status).toBe(409)
  })

  it('are replaced as a whole; an e-mail needs a subject, an SMS keeps none', async () => {
    const owner = await loginAs(USERS.buraOwner)
    const { body: made } = await owner.post<MessageTemplate>('/message-templates', sms('Prvi'))
    const changed = await owner.put<MessageTemplate>(`/message-templates/${made.id}`, {
      ...sms('Drugi'),
      subject: 'Ne treba',
      isActive: false,
    })
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ body: 'Drugi', subject: null, isActive: false })

    const noSubject = await owner.post<{ errors: Record<string, string[]> }>('/message-templates', {
      key: 'report_ready',
      channel: 'email',
      locale: 'hr-HR',
      body: 'Tekst',
      isActive: true,
    })
    expect(noSubject.status).toBe(400)
    expect(Object.keys(noSubject.body.errors)).toEqual(['subject'])
    const blank = await owner.post('/message-templates', sms('   '))
    expect(blank.status).toBe(400)
  })

  it('the platform defaults are not the tenant’s to change or delete', async () => {
    const owner = await loginAs(USERS.buraOwner)
    const [first] = (await owner.get<MessageTemplate[]>('/message-templates')).body
    expect(first?.isDefault).toBe(true)
    expect((await owner.put(`/message-templates/${first?.id ?? ''}`, sms('x'))).status).toBe(404)
    expect((await owner.del(`/message-templates/${first?.id ?? ''}`)).status).toBe(404)
  })

  it('belong to one company', async () => {
    const alarmko = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const own = (await alarmko.get<MessageTemplate[]>('/message-templates')).body.find(
      (m) => !m.isDefault,
    )
    expect((await bura.put(`/message-templates/${own?.id ?? ''}`, sms('x'))).status).toBe(404)
    expect((await bura.del(`/message-templates/${own?.id ?? ''}`)).status).toBe(404)
  })

  it('preview fills the placeholders, counts SMS segments and names the unknown ones', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const plain = await owner.post<Preview>('/message-templates/preview', {
      body: 'Poštovani {klijent}, {nepoznato}',
    })
    expect(plain.status).toBe(200)
    expect(plain.body).toMatchObject({
      rendered: 'Poštovani Ivan Horvat, {nepoznato}',
      unknownPlaceholders: ['nepoznato'],
      smsSegments: 1,
    })
    // š makes it UCS-2: 70 characters per message
    const long = await owner.post<Preview>('/message-templates/preview', { body: 'š'.repeat(71) })
    expect(long.body).toMatchObject({ length: 71, smsSegments: 2 })
    expect(
      (
        await owner.post('/message-templates/preview', {
          body: 'x',
          jobId: '00000000-0000-4000-8000-000000000000',
        })
      ).status,
    ).toBe(404)
  })
})
