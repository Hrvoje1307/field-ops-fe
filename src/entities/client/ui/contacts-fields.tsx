import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useFieldArray, useFormContext, useFormState, useWatch, get } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shared/ui/button'
import { FieldError, FieldLegend, FieldSet } from '@/shared/ui/field'
import { FieldRow, TextField } from '@/shared/ui/text-field'

import { type ContactFormValue, emptyContact } from '../model/client-form'

/**
 * The client's contacts: add, remove, mark the primary one (exactly one) and who
 * receives SMS. Paths `${name}.contacts.N.*` mirror `ClientUpdate.contacts`.
 */
export function ContactsFields({ name = '' }: { name?: string }) {
  const { t } = useTranslation()
  const path = name ? `${name}.contacts` : 'contacts'
  const { control, setValue, register } = useFormContext()
  const { fields, append, remove } = useFieldArray({ control, name: path, keyName: 'key' })
  const contacts = (useWatch({ name: path }) as ContactFormValue[] | undefined) ?? []
  const { errors } = useFormState({ name: path })
  const listError = get(errors, path) as
    { root?: { message?: string }; message?: string } | undefined
  const listMessage = listError?.root?.message ?? listError?.message

  const makePrimary = (index: number) => {
    contacts.forEach((_, other) => {
      setValue(`${path}.${String(other)}.isPrimary`, other === index, { shouldDirty: true })
    })
  }

  return (
    <FieldSet>
      <FieldLegend>{t('client.form.contacts')}</FieldLegend>
      <ul className="space-y-3">
        {fields.map((field, index) => {
          const contact = contacts[index]
          const at = (key: string) => `${path}.${String(index)}.${key}`
          return (
            <li key={field.key} className="space-y-3 rounded-lg border p-3" data-testid="contact">
              <FieldRow>
                <TextField name={at('name')} label={t('client.form.contactName')} required />
                <TextField
                  name={at('phone')}
                  label={t('client.phone')}
                  type="tel"
                  inputMode="tel"
                />
              </FieldRow>
              <TextField name={at('email')} label={t('client.email')} type="email" />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    className="accent-primary"
                    name={`${path}-primary`}
                    checked={contact?.isPrimary ?? false}
                    onChange={() => {
                      makePrimary(index)
                    }}
                  />
                  {t('client.form.primary')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    {...register(at('receivesSms'))}
                  />
                  {t('client.form.receivesSms')}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  disabled={fields.length === 1}
                  onClick={() => {
                    const wasPrimary = contact?.isPrimary ?? false
                    remove(index)
                    // The first remaining contact takes over as primary
                    if (wasPrimary) setValue(`${path}.0.isPrimary`, true, { shouldDirty: true })
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                  {t('client.form.removeContact')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {listMessage && <FieldError>{listMessage}</FieldError>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          append(emptyContact(contacts.length === 0))
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('client.form.addContact')}
      </Button>
    </FieldSet>
  )
}
