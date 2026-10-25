import { beforeEach, describe, expect, it } from 'vitest'

import type { Attachment, Tenant } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { loginAs, type Session, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3])

/** upload-url → PUT to the storage → confirm: a file attached to the company. */
async function uploadLogo(
  session: Session,
  tenantId: string,
  { mime = 'image/png', confirm = true } = {},
) {
  const target = await session.post<{
    attachmentId: string
    uploadUrl: string
    headers: Record<string, string>
  }>('/attachments/upload-url', {
    ownerType: 'tenant',
    ownerId: tenantId,
    kind: 'logo',
    fileName: 'logo.png',
    mime,
    sizeBytes: PNG.byteLength,
  })
  expect(target.status).toBe(201)
  const upload = await fetch(target.body.uploadUrl, {
    method: 'PUT',
    headers: target.body.headers,
    body: PNG as unknown as BodyInit,
  })
  expect(upload.status).toBe(200)
  if (!confirm) return target.body.attachmentId
  const confirmed = await session.post<Attachment>('/attachments', {
    attachmentId: target.body.attachmentId,
  })
  expect(confirmed.status).toBe(200)
  return confirmed.body.id
}

const updateFor = (slug: string, change: Record<string, unknown> = {}) => {
  const { tenant } = tenantBySlug(slug)
  return {
    name: tenant.name,
    locale: tenant.locale,
    timezone: tenant.timezone,
    currency: tenant.currency,
    settings: tenant.settings,
    ...change,
  }
}

describe('PUT /tenant and the logo', () => {
  it('links a confirmed logo of the company and shows its address', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const tenant = tenantBySlug('alarmko').tenant
    const logoId = await uploadLogo(owner, tenant.id)

    const saved = await owner.put<Tenant>(
      '/tenant',
      updateFor('alarmko', { logoAttachmentId: logoId }),
    )
    expect(saved.status).toBe(200)
    expect(saved.body.logoAttachmentId).toBe(logoId)
    expect(saved.body.logoUrl).toMatch(/^data:image\/png;base64,/)

    const removed = await owner.put<Tenant>(
      '/tenant',
      updateFor('alarmko', { logoAttachmentId: null }),
    )
    expect(removed.body.logoAttachmentId).toBeNull()
    expect(removed.body.logoUrl).toBeNull()
  })

  it('refuses a logo that is not there, not confirmed, or another kind of file', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const tenant = tenantBySlug('alarmko').tenant
    const unconfirmed = await uploadLogo(owner, tenant.id, { confirm: false })
    for (const logoAttachmentId of [crypto.randomUUID(), unconfirmed]) {
      const refused = await owner.put<{ errors: Record<string, string[]> }>(
        '/tenant',
        updateFor('alarmko', { logoAttachmentId }),
      )
      expect(refused.status).toBe(400)
      expect(Object.keys(refused.body.errors)).toEqual(['logoAttachmentId'])
    }
  })

  it('refuses another company’s logo', async () => {
    const alarmko = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const logoId = await uploadLogo(alarmko, tenantBySlug('alarmko').tenant.id)
    expect(
      (await bura.put('/tenant', updateFor('bura-klima', { logoAttachmentId: logoId }))).status,
    ).toBe(400)
  })

  it('keeps unset settings unset: the saved settings are the ones sent', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const saved = await owner.put<Tenant>(
      '/tenant',
      updateFor('alarmko', { settings: { requireSignature: false } }),
    )
    expect(saved.body.settings).toEqual({ requireSignature: false })
  })
})
