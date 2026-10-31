import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { type OAuthReturn, readOAuthReturn, useRefreshMailboxes } from '@/entities/mailbox'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'

/**
 * What the provider's return left in the address (`?connected=` or `?error=`), said once
 * and kept on screen until dismissed. The address is cleared at once (`onClear`, a replace,
 * so there is no new history entry and a reload does not say it again).
 */
export function OAuthReturnNotice({
  search,
  onClear,
}: {
  search: { connected?: string | undefined; error?: string | undefined }
  onClear: () => void
}) {
  const { t } = useTranslation()
  const refresh = useRefreshMailboxes()
  // The browser arrives with a fresh page load, so the address is read once, on arrival
  const [result, setResult] = useState<OAuthReturn | null>(() => readOAuthReturn(search))
  const arrived = result !== null
  const cleared = useRef(false)

  useEffect(() => {
    if (!arrived || cleared.current) return
    cleared.current = true
    // A connected mailbox is new to the cached list
    void refresh()
    onClear()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [arrived])

  if (!result) return null
  const text =
    result.kind === 'connected'
      ? t('sales.mailboxes.oauthReturn.connected')
      : result.code
        ? t(`sales.mailboxes.oauthReturn.error.${result.code}`)
        : t('sales.mailboxes.oauthReturn.generic')
  return (
    <Alert
      role={result.kind === 'error' ? 'alert' : 'status'}
      variant={result.kind === 'error' ? 'destructive' : 'default'}
    >
      <AlertDescription>{text}</AlertDescription>
      <AlertAction>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setResult(null)
          }}
        >
          {t('common.close')}
        </Button>
      </AlertAction>
    </Alert>
  )
}
