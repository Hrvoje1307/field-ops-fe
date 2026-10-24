import { useTranslation } from 'react-i18next'

import { CreateClientForm } from '@/features/client/create'

export function ClientCreatePage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('client.form.createTitle')}</h1>
      <CreateClientForm />
    </div>
  )
}
