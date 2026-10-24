import { z } from 'zod'

import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  customFieldFormValues,
} from '@/entities/custom-field'
import { Priority } from '@/shared/api/generated/model'
import { isPlainDate } from '@/shared/lib/datetime'
import { i18n } from '@/shared/i18n'

/** The tenant's field definitions per record the form may create. */
export interface QuickJobDefinitions {
  client: CustomFieldDefinition[]
  location: CustomFieldDefinition[]
  job: CustomFieldDefinition[]
}

/** Sources a person in the office enters; portal and service plan are set by the system. */
export const OFFICE_SOURCES = ['phone', 'email'] as const

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DIGITS = /^\d+$/

const text = () => z.string().trim()
const optionalWhole = (min: number, max: number, message: string) =>
  text()
    .refine(
      (value) =>
        value === '' || (DIGITS.test(value) && Number(value) >= min && Number(value) <= max),
      message,
    )
    .transform((value) => (value === '' ? undefined : Number(value)))

/**
 * The quick job form, built from the tenant's custom-field definitions. Client and
 * location are either picked (`existing`, by id) or entered (`new`); only the chosen
 * branch is validated and sent. Paths mirror the request bodies so 400 errors land on
 * the right inputs (see lib/error-paths).
 */
export function buildQuickJobSchema(definitions: QuickJobDefinitions) {
  const t = i18n.t.bind(i18n)

  const client = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('existing'),
      clientId: z.string().min(1, t('job.create.errors.clientRequired')),
    }),
    z.object({
      kind: z.literal('new'),
      type: z.enum(['person', 'company']),
      name: text().min(1, t('client.errors.nameRequired')),
      contactName: text(),
      phone: text(),
      email: text().refine(
        (value) => value === '' || z.email().safeParse(value).success,
        t('common.errors.emailInvalid'),
      ),
      oib: text().refine(
        (value) => value === '' || /^\d{11}$/.test(value),
        t('client.errors.oibInvalid'),
      ),
      customFields: buildCustomFieldsSchema(definitions.client),
    }),
  ])

  const location = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('existing'),
      locationId: z.string().min(1, t('job.create.errors.locationRequired')),
    }),
    z.object({
      kind: z.literal('new'),
      street: text().min(1, t('location.errors.streetRequired')),
      city: text().min(1, t('location.errors.cityRequired')),
      postalCode: text(),
      label: text(),
      accessNotes: text(),
      accessCodes: text(),
      customFields: buildCustomFieldsSchema(definitions.location),
    }),
  ])

  const job = z
    .object({
      jobTypeId: z.string().min(1, t('job.create.errors.jobTypeRequired')),
      title: text()
        .min(1, t('job.create.errors.titleRequired'))
        .max(200, t('job.create.errors.titleTooLong')),
      description: text(),
      priority: z.enum(Object.values(Priority)),
      source: z.enum(OFFICE_SOURCES),
      preferredDate: z
        .string()
        .refine((value) => value === '' || isPlainDate(value), t('job.create.errors.dateInvalid')),
      windowStart: z
        .string()
        .refine((value) => value === '' || TIME.test(value), t('job.create.errors.timeInvalid')),
      windowEnd: z
        .string()
        .refine((value) => value === '' || TIME.test(value), t('job.create.errors.timeInvalid')),
      durationMin: optionalWhole(5, 24 * 60, t('job.create.errors.duration')),
      requiredPeople: optionalWhole(1, 10, t('job.create.errors.people')),
      internalNote: text(),
      customFields: buildCustomFieldsSchema(definitions.job),
    })
    .superRefine((value, ctx) => {
      if (value.windowStart && value.windowEnd && value.windowEnd <= value.windowStart) {
        ctx.addIssue({
          code: 'custom',
          path: ['windowEnd'],
          message: t('job.create.errors.windowOrder'),
        })
      }
    })

  return z.object({ client, location, assetId: z.string(), job })
}

export type QuickJobSchema = ReturnType<typeof buildQuickJobSchema>
export type QuickJobFormValues = z.input<QuickJobSchema>
export type QuickJobValues = z.output<QuickJobSchema>
export type NewClientValues = Extract<QuickJobValues['client'], { kind: 'new' }>
type NewClientForm = Extract<QuickJobFormValues['client'], { kind: 'new' }>
type NewLocationForm = Extract<QuickJobFormValues['location'], { kind: 'new' }>
export type NewLocationValues = Extract<QuickJobValues['location'], { kind: 'new' }>
export type JobValues = QuickJobValues['job']

interface FormOptions {
  locale: string
}

/** Nothing picked yet; a new job from the phone with normal priority. */
export function emptyQuickJob(
  definitions: QuickJobDefinitions,
  { locale }: FormOptions,
): QuickJobFormValues {
  return {
    client: { kind: 'existing', clientId: '' },
    location: { kind: 'existing', locationId: '' },
    assetId: '',
    job: {
      jobTypeId: '',
      title: '',
      description: '',
      priority: 'normal',
      source: 'phone',
      preferredDate: '',
      windowStart: '',
      windowEnd: '',
      durationMin: '',
      requiredPeople: '',
      internalNote: '',
      customFields: customFieldFormValues(definitions.job, {}, { locale }),
    },
  }
}

/** A new client, with the number the dispatcher looked up. */
export function newClient(
  definitions: QuickJobDefinitions,
  { locale, phone = '' }: FormOptions & { phone?: string },
): NewClientForm {
  return {
    kind: 'new',
    type: 'person',
    name: '',
    contactName: '',
    phone,
    email: '',
    oib: '',
    customFields: customFieldFormValues(definitions.client, {}, { locale }),
  }
}

export function newLocation(
  definitions: QuickJobDefinitions,
  { locale }: FormOptions,
): NewLocationForm {
  return {
    kind: 'new',
    street: '',
    city: '',
    postalCode: '',
    label: '',
    accessNotes: '',
    accessCodes: '',
    customFields: customFieldFormValues(definitions.location, {}, { locale }),
  }
}
