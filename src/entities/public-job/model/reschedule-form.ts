import { z } from 'zod'

import type { RequestPublicRescheduleBody } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

import { RESCHEDULE_DATES_MAX, RESCHEDULE_NOTE_MAX } from '../const'

export interface RescheduleFormValues {
  note: string
  /** `yyyy-MM-dd` each; empty ones are left out. */
  dates: string[]
}

export const emptyReschedule: RescheduleFormValues = {
  note: '',
  dates: Array.from({ length: RESCHEDULE_DATES_MAX }, () => ''),
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** `today` is the client's own day (`yyyy-MM-dd`): a new time is asked for from then on. */
export function buildRescheduleSchema(today: string) {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      note: z
        .string()
        .max(
          RESCHEDULE_NOTE_MAX,
          t('public.reschedule.errors.noteTooLong', { max: RESCHEDULE_NOTE_MAX }),
        ),
      dates: z.array(
        z
          .string()
          .refine(
            (value) => value === '' || DATE.test(value),
            t('public.reschedule.errors.dateInvalid'),
          )
          .refine(
            (value) => value === '' || value >= today,
            t('public.reschedule.errors.datePast'),
          ),
      ),
    })
    .superRefine((values, context) => {
      const chosen = values.dates.filter((date) => date !== '')
      if (new Set(chosen).size < chosen.length) {
        const second = values.dates.findIndex(
          (date, index) => date !== '' && values.dates.indexOf(date) !== index,
        )
        context.addIssue({
          code: 'custom',
          path: ['dates', second],
          message: t('public.reschedule.errors.dateTwice'),
        })
      }
    })
}

/** Nothing typed is allowed too: the office is asked for another time all the same. */
export function toRescheduleBody(values: RescheduleFormValues): RequestPublicRescheduleBody {
  const note = values.note.trim()
  const preferredDates = [...new Set(values.dates.filter((date) => date !== ''))].sort()
  return {
    ...(note === '' ? {} : { note }),
    ...(preferredDates.length === 0 ? {} : { preferredDates }),
  }
}
