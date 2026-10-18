import { useTranslation } from 'react-i18next'

import { env } from '@/shared/config/env'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'

export function HomePage() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('home.title')}</h1>
        <p className="text-muted-foreground">{t('home.subtitle')}</p>
      </header>
      <p>{t('home.status')}</p>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="self-start">
            {t('home.about.open')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('home.about.title')}</DialogTitle>
            <DialogDescription>{t('home.about.description')}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">{t('home.about.apiUrl')}</dt>
            <dd className="font-mono break-all">{env.apiUrl}</dd>
            <dt className="text-muted-foreground">{t('home.about.mockApi')}</dt>
            <dd>{env.apiMock ? t('common.on') : t('common.off')}</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </main>
  )
}
