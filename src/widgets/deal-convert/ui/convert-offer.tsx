import { useTranslation } from 'react-i18next'

import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'

/** Asked after a deal is dropped in a won stage: convert now, or later (from the deal's page). */
export function ConvertOffer({
  dealTitle,
  onConvert,
  onLater,
}: {
  dealTitle: string
  onConvert: () => void
  onLater: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onLater()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('sales.convert.offerTitle')}</DialogTitle>
          <DialogDescription>
            {t('sales.convert.offerDescription', { title: dealTitle })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onLater}>
            {t('sales.convert.later')}
          </Button>
          <Button type="button" onClick={onConvert}>
            {t('sales.convert.convert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
