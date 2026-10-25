import { useTranslation } from 'react-i18next'

import { unicodeOnlyCharacters } from '@/shared/lib/sms'

import { Alert, AlertDescription } from './alert'

/** What the API's preview returns, as far as showing it needs. */
export interface PreviewResult {
  rendered: string
  length: number
  smsSegments: number
  unknownPlaceholders: string[]
}

/**
 * A message as the client would get it, with its length and SMS count, a note when č, ć,
 * š, ž or đ make an SMS hold fewer characters, and the placeholders that are not known.
 */
export function MessagePreview({
  title,
  channel,
  text,
  data,
  isError,
}: {
  title: string
  channel: 'sms' | 'email'
  /** What was asked to be previewed; blank has nothing to show. */
  text: string
  data: PreviewResult | undefined
  isError: boolean
}) {
  const { t } = useTranslation()
  const unicode = data && channel === 'sms' ? unicodeOnlyCharacters(data.rendered) : []

  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('message.preview.failed')}</AlertDescription>
        </Alert>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">
          {text.trim() === '' ? '' : t('message.preview.loading')}
        </p>
      ) : (
        <div className="space-y-2" aria-live="polite">
          <p
            data-testid="message-preview"
            className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap"
          >
            {data.rendered}
          </p>
          {channel === 'sms' && (
            <p className="text-sm text-muted-foreground">
              {t('message.preview.length', { count: data.length })} ·{' '}
              {t('message.preview.segments', { count: data.smsSegments })}
            </p>
          )}
          {unicode.length > 0 && (
            <Alert>
              <AlertDescription>
                {t('message.preview.unicode', { characters: unicode.join(' ') })}
              </AlertDescription>
            </Alert>
          )}
          {data.unknownPlaceholders.length > 0 && (
            <Alert>
              <AlertDescription>
                {t('message.preview.unknown', {
                  names: data.unknownPlaceholders.map((name) => `{${name}}`).join(', '),
                })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </section>
  )
}
