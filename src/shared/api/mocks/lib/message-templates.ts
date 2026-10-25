import type {
  MessageChannel,
  MessageTemplate,
  MessageTemplateKey,
} from '@/shared/api/generated/model'

import type { TenantData } from '../db/rows'

/** The words a template may use, with what a preview shows for them. */
export const PLACEHOLDER_SAMPLES: Record<string, string> = {
  klijent: 'Ivan Horvat',
  datum: '15. 10. 2026.',
  vrijeme_od: '09:00',
  vrijeme_do: '11:00',
  firma: 'Vaša tvrtka',
  monter: 'Marko',
  broj_naloga: 'RN-2026-0042',
  link: 'https://app.example/p/abc123',
}

interface PlatformDefault {
  /** Fixed, so the same default has the same id for every tenant. */
  id: string
  key: MessageTemplateKey
  channel: MessageChannel
  subject: string | null
  body: string
}

/** What the platform sends when a tenant has not written its own. */
export const PLATFORM_DEFAULTS: readonly PlatformDefault[] = [
  {
    id: '00000000-0000-4000-8000-0000000000a1',
    key: 'reminder_day_before',
    channel: 'sms',
    subject: null,
    body: '{firma}: podsjetnik, sutra {vrijeme_od}–{vrijeme_do} dolazi vam monter {monter}. Nalog {broj_naloga}.',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a2',
    key: 'reminder_day_before',
    channel: 'email',
    subject: 'Podsjetnik na termin {datum}',
    body: 'Poštovani {klijent},\n\npodsjećamo vas da sutra, {datum}, između {vrijeme_od} i {vrijeme_do} dolazi naš monter {monter}.\n\nNalog: {broj_naloga}\n\n{firma}',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a3',
    key: 'on_the_way',
    channel: 'sms',
    subject: null,
    body: '{firma}: monter {monter} je krenuo prema vama. Pratite dolazak: {link}',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a4',
    key: 'report_ready',
    channel: 'email',
    subject: 'Izvještaj za nalog {broj_naloga}',
    body: 'Poštovani {klijent},\n\nizvještaj o obavljenom radu je spreman: {link}\n\n{firma}',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a5',
    key: 'report_ready',
    channel: 'sms',
    subject: null,
    body: '{firma}: izvještaj za nalog {broj_naloga} je spreman: {link}',
  },
  {
    id: '00000000-0000-4000-8000-0000000000a6',
    key: 'reschedule_ack',
    channel: 'sms',
    subject: null,
    body: '{firma}: termin je promijenjen na {datum} u {vrijeme_od}. Hvala na razumijevanju.',
  },
]

/**
 * The templates the tenant sees: its own, and for each key and channel it has not
 * written (in its locale) the platform default.
 */
export function effectiveTemplates(t: TenantData): MessageTemplate[] {
  const locale = t.tenant.locale
  const own = t.messageTemplates
  const defaults: MessageTemplate[] = PLATFORM_DEFAULTS.filter(
    (d) => !own.some((o) => o.key === d.key && o.channel === d.channel && o.locale === locale),
  ).map((d) => ({
    id: d.id,
    key: d.key,
    channel: d.channel,
    locale,
    subject: d.subject,
    body: d.body,
    isActive: true,
    isDefault: true,
  }))
  return [...own, ...defaults]
}

const PLACEHOLDER = /\{([^{}\s]*)\}/g

/** The text with the placeholders replaced, and the ones that are not known. */
export function renderBody(body: string): { rendered: string; unknown: string[] } {
  const unknown: string[] = []
  const rendered = body.replace(PLACEHOLDER, (whole: string, name: string) => {
    const sample = PLACEHOLDER_SAMPLES[name]
    if (sample !== undefined) return sample
    if (!unknown.includes(name)) unknown.push(name)
    return whole
  })
  return { rendered, unknown }
}

// The GSM 03.38 basic character set (and its extension table, which costs two)
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM_EXTENDED = '^{}\\[~]|€\f'

/** How many SMS messages a text takes: GSM-7 160/153 characters, else UCS-2 70/67. */
export function smsSegments(text: string): { length: number; segments: number } {
  const characters = Array.from(text)
  const gsm = characters.every((c) => GSM_BASIC.includes(c) || GSM_EXTENDED.includes(c))
  if (gsm) {
    const length = characters.reduce((sum, c) => sum + (GSM_EXTENDED.includes(c) ? 2 : 1), 0)
    return { length, segments: length === 0 ? 0 : length <= 160 ? 1 : Math.ceil(length / 153) }
  }
  const length = text.length
  return { length, segments: length === 0 ? 0 : length <= 70 ? 1 : Math.ceil(length / 67) }
}
