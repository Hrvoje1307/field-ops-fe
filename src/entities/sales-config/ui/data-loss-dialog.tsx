import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/shared/ui/confirm-dialog'

import type { DataLoss } from '../model/settings-form'

/** Said before a save that deletes stored mail; the save goes ahead only on "Spremi i obriši". */
export function DataLossDialog({
  loss,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** What the save would delete; the dialog is open while this is not empty. */
  loss: readonly DataLoss[]
  pending: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      open={loss.length > 0}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
      title={t('sales.settings.loss.title')}
      description={
        <span className="block space-y-2">
          {loss.map((kind) => (
            <span key={kind} className="block">
              {t(`sales.settings.loss.${kind}`)}
            </span>
          ))}
          <span className="block font-medium">{t('sales.settings.loss.irreversible')}</span>
        </span>
      }
      confirmLabel={t('sales.settings.loss.confirm')}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    />
  )
}
