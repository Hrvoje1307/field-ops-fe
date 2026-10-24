import { z } from 'zod'

import type {
  Client,
  ClientType,
  ClientUpdate,
  ContactInput,
  CustomFieldValues,
} from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

/** One contact row; `contactId` is the stored contact's id (empty for a new one). */
export interface ContactFormValue {
  contactId: string
  name: string
  phone: string
  email: string
  isPrimary: boolean
  receivesSms: boolean
}

export interface ClientFormValues<CustomFields> {
  type: ClientType
  name: string
  oib: string
  email: string
  notes: string
  contacts: ContactFormValue[]
  customFields: CustomFields
}

const text = () => z.string().trim()
const optionalEmail = (message: string) =>
  text().refine((value) => value === '' || z.email().safeParse(value).success, message)

/**
 * The client's own fields and contacts. The custom-fields schema comes from the
 * caller (built from the tenant's definitions). Paths mirror `ClientUpdate`, so 400
 * errors like `contacts[1].phone` map onto the inputs.
 */
export function buildClientSchema<CustomFieldsInput>(
  customFields: z.ZodType<CustomFieldValues, CustomFieldsInput>,
) {
  const t = i18n.t.bind(i18n)
  return z.object({
    type: z.enum(['person', 'company']),
    name: text().min(1, t('client.errors.nameRequired')),
    oib: text().refine(
      (value) => value === '' || /^\d{11}$/.test(value),
      t('client.errors.oibInvalid'),
    ),
    email: optionalEmail(t('common.errors.emailInvalid')),
    notes: text(),
    contacts: z
      .array(
        z.object({
          contactId: z.string(),
          name: text().min(1, t('client.form.contactNameRequired')),
          phone: text(),
          email: optionalEmail(t('common.errors.emailInvalid')),
          isPrimary: z.boolean(),
          receivesSms: z.boolean(),
        }),
      )
      .min(1, t('client.form.contactRequired')),
    customFields,
  })
}

export function emptyContact(isPrimary: boolean): ContactFormValue {
  return { contactId: '', name: '', phone: '', email: '', isPrimary, receivesSms: true }
}

/**
 * Form values for a stored client, or an empty person with one primary contact.
 * `formatPhone` shows stored E.164 numbers the way people type them (the API accepts
 * any format).
 */
export function clientFormValues<CustomFields>(
  client: Client | undefined,
  customFields: CustomFields,
  formatPhone: (e164: string) => string = (phone) => phone,
): ClientFormValues<CustomFields> {
  if (!client) {
    return {
      type: 'person',
      name: '',
      oib: '',
      email: '',
      notes: '',
      contacts: [emptyContact(true)],
      customFields,
    }
  }
  return {
    type: client.type,
    name: client.name,
    oib: client.oib ?? '',
    email: client.email ?? '',
    notes: client.notes ?? '',
    contacts: client.contacts.map((contact) => ({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone ? formatPhone(contact.phone) : '',
      email: contact.email ?? '',
      isPrimary: contact.isPrimary,
      receivesSms: contact.receivesSms,
    })),
    customFields,
  }
}

const orNull = (value: string) => (value === '' ? null : value)

/**
 * `ClientUpdate` (also the body of `ClientCreate`). Contacts with an id are updated,
 * without one created; the API deletes the ones left out. Exactly one is primary.
 */
export function toClientBody(
  values: ClientFormValues<CustomFieldValues>,
  version?: number,
): ClientUpdate {
  const primary = Math.max(
    0,
    values.contacts.findIndex((contact) => contact.isPrimary),
  )
  const contacts = values.contacts.map((contact, index): ContactInput => ({
    ...(contact.contactId ? { id: contact.contactId } : {}),
    name: contact.name,
    phone: orNull(contact.phone),
    email: orNull(contact.email),
    isPrimary: index === primary,
    receivesSms: contact.receivesSms,
  }))
  return {
    type: values.type,
    name: values.name,
    oib: orNull(values.oib),
    email: orNull(values.email),
    notes: orNull(values.notes),
    contacts,
    customFields: values.customFields,
    ...(version === undefined ? {} : { version }),
  }
}
