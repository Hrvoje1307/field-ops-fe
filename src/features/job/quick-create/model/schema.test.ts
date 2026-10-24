import { describe, expect, it } from 'vitest'

import type { CustomFieldDefinition } from '@/shared/api/generated/model'

import {
  buildQuickJobSchema,
  emptyQuickJob,
  newClient,
  newLocation,
  type QuickJobDefinitions,
  type QuickJobFormValues,
} from './schema'

const field = (
  entity: CustomFieldDefinition['entity'],
  key: string,
  required = false,
): CustomFieldDefinition => ({
  id: `${entity}-${key}`,
  entity,
  assetTypeId: null,
  key,
  label: key,
  type: 'text',
  options: null,
  required,
  isSensitive: false,
  sortOrder: 1,
})

const DEFINITIONS: QuickJobDefinitions = {
  client: [field('client', 'clientRef', true)],
  location: [field('location', 'floor', true)],
  job: [field('job', 'reference', true)],
}
const OPTIONS = { locale: 'hr-HR' }

function parse(values: QuickJobFormValues) {
  const result = buildQuickJobSchema(DEFINITIONS).safeParse(values)
  return result.success
    ? { data: result.data, errors: {} }
    : {
        data: undefined,
        errors: Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      }
}

/** A complete form for an existing client and location. */
function filled(): QuickJobFormValues {
  const values = emptyQuickJob(DEFINITIONS, OPTIONS)
  return {
    ...values,
    client: { kind: 'existing', clientId: 'c1' },
    location: { kind: 'existing', locationId: 'l1' },
    job: {
      ...values.job,
      jobTypeId: 'jt1',
      title: '  Kvar  ',
      customFields: { reference: 'R-1' },
    },
  }
}

describe('buildQuickJobSchema', () => {
  it('an empty form asks for client, location, job type, title and required fields', () => {
    expect(parse(emptyQuickJob(DEFINITIONS, OPTIONS)).errors).toEqual({
      'client.clientId': 'Odaberite klijenta ili dodajte novog.',
      'location.locationId': 'Odaberite lokaciju.',
      'job.jobTypeId': 'Odaberite vrstu naloga.',
      'job.title': 'Upišite naslov.',
      'job.customFields.reference': 'Obavezno polje.',
    })
  })

  it('existing client and location: ids only; text trimmed, empty numbers left out', () => {
    const { data } = parse(filled())
    expect(data?.client).toEqual({ kind: 'existing', clientId: 'c1' })
    expect(data?.location).toEqual({ kind: 'existing', locationId: 'l1' })
    expect(data?.job).toMatchObject({
      title: 'Kvar',
      priority: 'normal',
      source: 'phone',
      durationMin: undefined,
      requiredPeople: undefined,
      customFields: { reference: 'R-1' },
    })
  })

  it('new client and location: their own fields and required custom fields count', () => {
    const values = {
      ...filled(),
      client: newClient(DEFINITIONS, { ...OPTIONS, phone: '091 234 5678' }),
      location: newLocation(DEFINITIONS, OPTIONS),
    }
    expect(parse(values).errors).toEqual({
      'client.name': 'Upišite ime ili naziv.',
      'client.customFields.clientRef': 'Obavezno polje.',
      'location.street': 'Upišite ulicu i broj.',
      'location.city': 'Upišite mjesto.',
      'location.customFields.floor': 'Obavezno polje.',
    })

    const ok = parse({
      ...values,
      client: {
        ...values.client,
        name: ' Ana ',
        oib: '12345678901',
        customFields: { clientRef: 'K-1' },
      },
      location: {
        ...values.location,
        street: 'Ilica 1',
        city: 'Zagreb',
        customFields: { floor: '2' },
      },
    })
    expect(ok.data?.client).toMatchObject({
      kind: 'new',
      name: 'Ana',
      phone: '091 234 5678',
      customFields: { clientRef: 'K-1' },
    })
    expect(ok.data?.location).toMatchObject({ kind: 'new', street: 'Ilica 1', city: 'Zagreb' })
  })

  it('a picked client does not need the new-client fields (only the chosen branch counts)', () => {
    const values = filled()
    // Leftovers of a new client the dispatcher started and abandoned
    expect(parse({ ...values, client: { kind: 'existing', clientId: 'c1' } }).errors).toEqual({})
  })

  it('checks email, OIB, numbers, dates, times and the window order', () => {
    const values = filled()
    const result = parse({
      ...values,
      client: {
        ...newClient(DEFINITIONS, OPTIONS),
        name: 'Ana',
        email: 'ana@',
        oib: '123',
        customFields: { clientRef: 'K' },
      },
      location: {
        ...newLocation(DEFINITIONS, OPTIONS),
        street: 'Ilica 1',
        city: 'Zagreb',
        customFields: { floor: '1' },
      },
      job: {
        ...values.job,
        durationMin: '4',
        requiredPeople: '11',
        preferredDate: '2026-02-30',
        windowStart: '10:00',
        windowEnd: '09:30',
      },
    })
    expect(result.errors).toEqual({
      'client.email': 'Upišite ispravan email.',
      'client.oib': 'OIB ima 11 znamenki.',
      'job.durationMin': 'Upišite cijeli broj minuta, najmanje 5.',
      'job.requiredPeople': 'Upišite broj od 1 do 10.',
      'job.preferredDate': 'Upišite ispravan datum.',
      // Shown together with the other errors, not only after they are fixed
      'job.windowEnd': 'Kraj mora biti nakon početka.',
    })

    const window = parse({
      ...values,
      job: { ...values.job, windowStart: '10:00', windowEnd: '09:30' },
    })
    expect(window.errors).toEqual({ 'job.windowEnd': 'Kraj mora biti nakon početka.' })
  })

  it('turns duration and crew size into numbers', () => {
    const values = filled()
    expect(
      parse({ ...values, job: { ...values.job, durationMin: ' 90 ', requiredPeople: '2' } }).data
        ?.job,
    ).toMatchObject({ durationMin: 90, requiredPeople: 2 })
  })
})
