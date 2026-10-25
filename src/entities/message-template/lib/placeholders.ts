import type { MessageTemplateKey } from '@/shared/api/generated/model'

/**
 * The words the API fills in a message (listed in the contract, on the template's `body`).
 * Written between braces: `{klijent}`.
 */
export const PLACEHOLDERS = [
  'klijent',
  'datum',
  'vrijeme_od',
  'vrijeme_do',
  'firma',
  'monter',
  'broj_naloga',
  'link',
] as const

export type Placeholder = (typeof PLACEHOLDERS)[number]

/** The placeholder as it is written in a text. */
export const placeholderText = (name: Placeholder) => `{${name}}`

/** The messages the platform sends, in the order they happen to a job (the contract's enum). */
export const MESSAGE_KEYS: readonly MessageTemplateKey[] = [
  'reminder_day_before',
  'on_the_way',
  'report_ready',
  'reschedule_ack',
]

/**
 * `text` with `inserted` in place of the selection (or at the cursor), and where the
 * cursor goes afterwards: right after what was put in.
 */
export function insertAt(
  text: string,
  inserted: string,
  selectionStart: number,
  selectionEnd: number,
): { text: string; cursor: number } {
  const start = Math.min(Math.max(selectionStart, 0), text.length)
  const end = Math.min(Math.max(selectionEnd, start), text.length)
  return {
    text: text.slice(0, start) + inserted + text.slice(end),
    cursor: start + inserted.length,
  }
}
