import { beforeEach, describe, expect, it } from 'vitest'

import type { ChecklistTemplate, JobType } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

describe('checklist templates', () => {
  it('are listed for the office, and not for technicians', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const ivan = await loginAs(USERS.ivan)
    const listed = await owner.get<ChecklistTemplate[]>('/checklist-templates')
    expect(listed.status).toBe(200)
    expect(listed.body.length).toBeGreaterThan(0)
    expect((await dispatcher.get('/checklist-templates')).status).toBe(200)
    expect((await ivan.get('/checklist-templates')).status).toBe(403)
    expect(
      (await ivan.post('/checklist-templates', { name: 'X', items: [{ label: 'a' }] })).status,
    ).toBe(403)
  })

  it('are created with required defaulting to false, and replaced as a whole', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const created = await owner.post<ChecklistTemplate>('/checklist-templates', {
      name: ' Obilazak ',
      items: [{ label: ' Provjera ' }, { label: 'Fotografija', required: true }],
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: 'Obilazak',
      items: [
        { label: 'Provjera', required: false },
        { label: 'Fotografija', required: true },
      ],
    })

    const replaced = await owner.put<ChecklistTemplate>(`/checklist-templates/${created.body.id}`, {
      name: 'Obilazak 2',
      items: [{ label: 'Samo jedno' }],
    })
    expect(replaced.status).toBe(200)
    expect(replaced.body.items).toEqual([{ label: 'Samo jedno', required: false }])
    expect(
      (
        await owner.put('/checklist-templates/00000000-0000-4000-8000-000000000000', {
          name: 'X',
          items: [],
        })
      ).status,
    ).toBe(404)
  })

  it('refuse a blank name or label with the field named', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const refused = await owner.post<{ errors: Record<string, string[]> }>('/checklist-templates', {
      name: ' ',
      items: [{ label: 'ok' }, { label: '  ' }],
    })
    expect(refused.status).toBe(400)
    expect(Object.keys(refused.body.errors).sort()).toEqual(['items[1].label', 'name'])
  })

  it('a deleted one is gone from the job types that used it', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const jobType = tenantBySlug('alarmko').jobTypes.find((jt) => jt.checklistTemplateId)
    if (!jobType?.checklistTemplateId) throw new Error('Seed needs a job type with a checklist')
    expect((await owner.del(`/checklist-templates/${jobType.checklistTemplateId}`)).status).toBe(
      204,
    )
    const after = await owner.get<JobType[]>('/job-types')
    expect(after.body.find((jt) => jt.id === jobType.id)?.checklistTemplateId).toBeNull()
    expect((await owner.del(`/checklist-templates/${jobType.checklistTemplateId}`)).status).toBe(
      404,
    )
  })

  it('belong to one company', async () => {
    const alarmko = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const mine = (await alarmko.get<ChecklistTemplate[]>('/checklist-templates')).body[0]
    const theirs = (await bura.get<ChecklistTemplate[]>('/checklist-templates')).body
    expect(theirs.map((template) => template.id)).not.toContain(mine?.id)
    expect((await bura.del(`/checklist-templates/${mine?.id ?? ''}`)).status).toBe(404)
  })
})
