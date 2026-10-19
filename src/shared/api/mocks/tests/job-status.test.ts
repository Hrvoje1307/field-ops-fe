import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Job,
  ProblemDetails,
  StatusHistoryEntry,
  ValidationProblemDetails,
} from '@/shared/api/generated/model'
import { addDays, todayInTimeZone, zonedDateTimeToInstant } from '@/shared/lib/datetime'

import { resetMockDb } from '../db'
import { jobId, loginAs, technicianId, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')

// Seeded Alarmko jobs
const SCHEDULED_PETRA = () => jobId('alarmko', 'Sustav se ne može isključiti') // scheduled, Petra
const EN_ROUTE_PETRA = () => jobId('alarmko', 'Godišnji servis', 'Tomislav Đurđević') // en_route, Petra
const ON_SITE_IVAN = () => jobId('alarmko', 'Ugradnja kontrole pristupa na 3. katu') // on_site, Ivan + Luka
const NEW_UNASSIGNED = () => jobId('alarmko', 'Sirena se oglašava bez razloga') // new
const COMPLETED = () => jobId('alarmko', 'Magnetski kontakt na ulaznim vratima')
const INVOICED = () => jobId('alarmko', 'Ugradnja novog sustava')

describe('allowedTransitions', () => {
  it('lists the full table row for the office', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const job = (await dispatcher.get<Job>(`/jobs/${SCHEDULED_PETRA()}`)).body
    expect(job.allowedTransitions.sort()).toEqual(['cancelled', 'confirmed', 'en_route', 'new'])
    expect((await dispatcher.get<Job>(`/jobs/${INVOICED()}`)).body.allowedTransitions).toEqual([])
    expect(
      (await dispatcher.get<Job>(`/jobs/${COMPLETED()}`)).body.allowedTransitions.sort(),
    ).toEqual(['invoiced', 'new'])
  })

  it('lists only field steps for the assigned technician', async () => {
    const petra = await loginAs(USERS.petra)
    expect((await petra.get<Job>(`/jobs/${SCHEDULED_PETRA()}`)).body.allowedTransitions).toEqual([
      'en_route',
    ])
    expect((await petra.get<Job>(`/jobs/${EN_ROUTE_PETRA()}`)).body.allowedTransitions).toEqual([
      'on_site',
    ])

    const ivan = await loginAs(USERS.ivan)
    expect((await ivan.get<Job>(`/jobs/${ON_SITE_IVAN()}`)).body.allowedTransitions.sort()).toEqual(
      ['completed', 'on_hold'],
    )
  })

  it('leaves out scheduled while the job has no date or technician', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    expect(
      (await dispatcher.get<Job>(`/jobs/${NEW_UNASSIGNED()}`)).body.allowedTransitions,
    ).toEqual(['cancelled'])
  })
})

describe('POST /transition', () => {
  it('moves along the machine, bumps version and writes history', async () => {
    const petra = await loginAs(USERS.petra)
    const before = (await petra.get<Job>(`/jobs/${EN_ROUTE_PETRA()}`)).body

    const response = await petra.post<Job>(`/jobs/${EN_ROUTE_PETRA()}/transition`, {
      to: 'on_site',
      lat: 45.78,
      lng: 15.92,
      version: before.version,
    })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('on_site')
    expect(response.body.version).toBe(before.version + 1)

    const history = (await petra.get<StatusHistoryEntry[]>(`/jobs/${EN_ROUTE_PETRA()}/history`))
      .body
    expect(history.at(-1)).toMatchObject({
      fromStatus: 'en_route',
      toStatus: 'on_site',
      lat: 45.78,
      lng: 15.92,
    })
    expect(history.at(-1)?.changedBy?.fullName).toBe('Petra Jurić')
  })

  it('refuses completed (409): that goes through /complete', async () => {
    const ivan = await loginAs(USERS.ivan)
    const response = await ivan.post<ProblemDetails>(`/jobs/${ON_SITE_IVAN()}/transition`, {
      to: 'completed',
    })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('job.use_complete_endpoint')
  })

  it('refuses transitions not in the table (409)', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const response = await dispatcher.post<ProblemDetails>(`/jobs/${NEW_UNASSIGNED()}/transition`, {
      to: 'en_route',
    })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('job.invalid_transition')
    // en_route → cancelled isn't in the OpenAPI table either
    expect(
      (
        await dispatcher.post(`/jobs/${EN_ROUTE_PETRA()}/transition`, {
          to: 'cancelled',
          note: 'x',
        })
      ).status,
    ).toBe(409)
  })

  it('refuses office-only transitions for technicians (403)', async () => {
    const petra = await loginAs(USERS.petra)
    const response = await petra.post<ProblemDetails>(`/jobs/${SCHEDULED_PETRA()}/transition`, {
      to: 'cancelled',
      note: 'Ne mogu stići.',
    })
    expect(response.status).toBe(403)
  })

  it.each(['cancelled', 'on_hold'] as const)('requires a note for %s (400 on note)', async (to) => {
    const ivan = await loginAs(USERS.ivan)
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const [session, id] =
      to === 'on_hold' ? [ivan, ON_SITE_IVAN()] : [dispatcher, SCHEDULED_PETRA()]

    const missing = await session.post<ValidationProblemDetails>(`/jobs/${id}/transition`, {
      to,
      note: '  ',
    })
    expect(missing.status).toBe(400)
    expect(missing.body.errors).toHaveProperty('note')

    const withNote = await session.post<Job>(`/jobs/${id}/transition`, {
      to,
      note: 'Čeka dijelove.',
    })
    expect(withNote.status).toBe(200)
    expect(to === 'on_hold' ? withNote.body.onHoldReason : withNote.body.cancelReason).toBe(
      'Čeka dijelove.',
    )
  })

  it('needs a date and a technician for scheduled (409)', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const response = await dispatcher.post<ProblemDetails>(`/jobs/${NEW_UNASSIGNED()}/transition`, {
      to: 'scheduled',
    })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('job.not_schedulable')
  })

  it('lets the office reopen a completed job, back to the queue', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const reopened = await dispatcher.post<Job>(`/jobs/${COMPLETED()}/transition`, { to: 'new' })
    expect(reopened.status).toBe(200)
    expect(reopened.body).toMatchObject({
      status: 'new',
      scheduledDate: null,
      completedAt: null,
      technicians: [],
    })
  })
})

describe('POST /assign', () => {
  it('with a date and technician, moves a new job to scheduled', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const ivan = technicianId('alarmko', USERS.ivan)
    const date = addDays(today(), 2)
    const response = await dispatcher.post<Job>(`/jobs/${NEW_UNASSIGNED()}/assign`, {
      technicianIds: [ivan],
      scheduledDate: date,
      scheduledStart: zonedDateTimeToInstant(date, '09:00', 'Europe/Zagreb'),
    })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ status: 'scheduled', scheduledDate: date })
    expect(response.body.technicians).toEqual([expect.objectContaining({ id: ivan, isLead: true })])

    const history = (
      await dispatcher.get<StatusHistoryEntry[]>(`/jobs/${NEW_UNASSIGNED()}/history`)
    ).body
    expect(history.at(-1)).toMatchObject({ fromStatus: 'new', toStatus: 'scheduled' })
  })

  it('with no technicians, moves a scheduled job back to new and clears the date', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const response = await dispatcher.post<Job>(`/jobs/${SCHEDULED_PETRA()}/assign`, {
      technicianIds: [],
    })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      status: 'new',
      scheduledDate: null,
      scheduledStart: null,
      technicians: [],
    })
  })

  it('validates technicians, lead and start time (400 with paths)', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const ivan = technicianId('alarmko', USERS.ivan)
    const luka = technicianId('alarmko', USERS.luka)
    const response = await dispatcher.post<ValidationProblemDetails>(
      `/jobs/${NEW_UNASSIGNED()}/assign`,
      {
        technicianIds: [ivan, technicianId('bura-klima', USERS.ante)],
        leadTechnicianId: luka,
        scheduledDate: today(),
        scheduledStart: zonedDateTimeToInstant(addDays(today(), 1), '09:00', 'Europe/Zagreb'),
      },
    )
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors).sort()).toEqual([
      'leadTechnicianId',
      'scheduledStart',
      'technicianIds[1]',
    ])
  })

  it('refuses jobs already under way (409)', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    expect(
      (await dispatcher.post(`/jobs/${EN_ROUTE_PETRA()}/assign`, { technicianIds: [] })).status,
    ).toBe(409)
    expect(
      (await dispatcher.post(`/jobs/${COMPLETED()}/assign`, { technicianIds: [] })).status,
    ).toBe(409)
  })
})
