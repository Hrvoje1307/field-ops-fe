import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shared/ui/button'

export function ErrorPage({ error }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('error.title')}</h1>
      <p className="text-muted-foreground">{t('error.description')}</p>
      {import.meta.env.DEV && (
        <pre className="overflow-auto rounded-lg bg-muted p-3 text-xs">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
      <Button
        className="self-start"
        onClick={() => {
          // Re-runs loaders and resets the route error boundary
          void router.invalidate()
        }}
      >
        {t('error.retry')}
      </Button>
    </main>
  )
}
