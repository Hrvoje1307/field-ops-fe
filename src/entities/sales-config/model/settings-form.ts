import { z } from 'zod'

import type { DraftTone, SalesSettings } from '@/shared/api/generated/model'
import { i18n } from '@/shared/i18n'

export const KNOWLEDGE_MAX = 20_000
export const RETENTION_MIN_DAYS = 30
export const TONES: readonly DraftTone[] = ['formal', 'neutral', 'friendly']

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
const WHOLE = /^\d{1,6}$/

/** `replyLanguage` is "auto" or a BCP-47 tag; "other" in the form means the typed tag. */
export const LANGUAGE_AUTO = 'auto'
export const LANGUAGE_OTHER = 'other'

/** A BCP-47 language tag the runtime accepts (`hr`, `en-GB`, `sr-Latn`). */
export function isLanguageTag(value: string): boolean {
  if (!value || value === LANGUAGE_AUTO || /[^A-Za-z0-9-]/.test(value)) return false
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

/** The tenant's language: the language part of its locale (`hr-HR` → `hr`). */
export function tenantLanguage(locale: string): string | undefined {
  try {
    const language = new Intl.Locale(locale).language
    return language || undefined
  } catch {
    return undefined
  }
}

/** The name of a language tag in the interface language (`hr` → "hrvatski"). */
export function languageName(tag: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

// --- AI and knowledge ---------------------------------------------------------------

export interface AiFormValues {
  aiEnabled: boolean
  tone: DraftTone
  /** "auto", the tenant's language tag, or "other" (then `customLanguage` is the tag). */
  language: string
  customLanguage: string
  signature: string
  knowledge: string
  responseSlaHours: string
  /** A whole percent, 0–100; the API takes 0–1. */
  reviewThreshold: string
  /** Empty = keep forever. */
  retentionDays: string
}

/** The fields of `SalesSettings` the AI screen writes; everything else is left as the API has it. */
export type AiFields = Pick<
  SalesSettings,
  | 'aiEnabled'
  | 'tone'
  | 'replyLanguage'
  | 'signature'
  | 'knowledge'
  | 'responseSlaHours'
  | 'reviewThreshold'
  | 'retentionDays'
>

export function buildAiSchema() {
  const t = i18n.t.bind(i18n)
  return z
    .object({
      aiEnabled: z.boolean(),
      tone: z.enum(['formal', 'neutral', 'friendly']),
      language: z.string().min(1),
      customLanguage: z.string().trim(),
      signature: z.string(),
      knowledge: z.string().max(KNOWLEDGE_MAX, t('sales.settings.ai.knowledgeTooLong')),
      responseSlaHours: z
        .string()
        .trim()
        .refine(
          (value) => WHOLE.test(value) && Number(value) >= 1 && Number(value) <= 168,
          t('sales.settings.ai.slaInvalid'),
        ),
      reviewThreshold: z
        .string()
        .trim()
        .refine(
          (value) => WHOLE.test(value) && Number(value) <= 100,
          t('sales.settings.ai.thresholdInvalid'),
        ),
      retentionDays: z
        .string()
        .trim()
        .refine(
          (value) => value === '' || (WHOLE.test(value) && Number(value) >= RETENTION_MIN_DAYS),
          t('sales.settings.ai.retentionInvalid', { min: RETENTION_MIN_DAYS }),
        ),
    })
    .superRefine((values, context) => {
      if (values.language === LANGUAGE_OTHER && !isLanguageTag(values.customLanguage)) {
        context.addIssue({
          code: 'custom',
          path: ['customLanguage'],
          message: t('sales.settings.ai.languageInvalid'),
        })
      }
    })
}

export function aiFormValues(settings: SalesSettings, tenantTag: string | undefined): AiFormValues {
  const known = settings.replyLanguage === LANGUAGE_AUTO || settings.replyLanguage === tenantTag
  return {
    aiEnabled: settings.aiEnabled,
    tone: settings.tone,
    language: known ? settings.replyLanguage : LANGUAGE_OTHER,
    customLanguage: known ? '' : settings.replyLanguage,
    signature: settings.signature ?? '',
    knowledge: settings.knowledge ?? '',
    responseSlaHours: String(settings.responseSlaHours),
    reviewThreshold: String(Math.round((settings.reviewThreshold ?? 0.7) * 100)),
    retentionDays: settings.retentionDays ? String(settings.retentionDays) : '',
  }
}

export function toAiFields(values: AiFormValues): AiFields {
  return {
    aiEnabled: values.aiEnabled,
    tone: values.tone,
    replyLanguage: values.language === LANGUAGE_OTHER ? values.customLanguage : values.language,
    signature: values.signature.trim() === '' ? null : values.signature,
    knowledge: values.knowledge.trim() === '' ? null : values.knowledge,
    responseSlaHours: Number(values.responseSlaHours),
    reviewThreshold: Number((Number(values.reviewThreshold) / 100).toFixed(2)),
    retentionDays: values.retentionDays === '' ? null : Number(values.retentionDays),
  }
}

// --- Digest ---------------------------------------------------------------------------

export interface DigestFormValues {
  digestEnabled: boolean
  digestTime: string
  digestRecipientIds: string[]
  storeNonSalesBodies: boolean
}

export type DigestFields = Pick<
  SalesSettings,
  'digestEnabled' | 'digestTime' | 'digestRecipientIds' | 'storeNonSalesBodies'
>

export function buildDigestSchema() {
  const t = i18n.t.bind(i18n)
  return z.object({
    digestEnabled: z.boolean(),
    digestTime: z.string().regex(TIME_OF_DAY, t('sales.settings.digest.timeInvalid')),
    digestRecipientIds: z.array(z.string()),
    storeNonSalesBodies: z.boolean(),
  })
}

/** The form starts from what is stored, including recipients who no longer have access. */
export function digestFormValues(settings: SalesSettings): DigestFormValues {
  return {
    digestEnabled: settings.digestEnabled,
    digestTime: settings.digestTime,
    digestRecipientIds: [...(settings.digestRecipientIds ?? [])],
    storeNonSalesBodies: settings.storeNonSalesBodies,
  }
}

/** Recipients who no longer have access to Prodaja (shown in the form, removed on save). */
export function staleRecipients(
  recipientIds: readonly string[],
  memberIds: readonly string[],
): string[] {
  return recipientIds.filter((id) => !memberIds.includes(id))
}

/** What is saved: the recipients are the members who still have access. */
export function toDigestFields(
  values: DigestFormValues,
  memberIds: readonly string[],
): DigestFields {
  return {
    ...values,
    digestRecipientIds: values.digestRecipientIds.filter((id) => memberIds.includes(id)),
  }
}

// --- What a save deletes ----------------------------------------------------------------

export type DataLoss = 'nonSalesBodies' | 'retention'

/**
 * Saving can delete stored mail: turning `storeNonSalesBodies` off drops the bodies of
 * non-sales threads kept so far, and a retention (or a shorter one than before) deletes the
 * bodies of threads quiet for that long. The user confirms before such a save.
 */
export function dataLossOf(current: SalesSettings, next: Partial<SalesSettings>): DataLoss[] {
  const loss: DataLoss[] = []
  if (current.storeNonSalesBodies && next.storeNonSalesBodies === false) loss.push('nonSalesBodies')
  if (
    next.retentionDays != null &&
    (current.retentionDays == null || next.retentionDays < current.retentionDays)
  ) {
    loss.push('retention')
  }
  return loss
}
