import { zodResolver } from '@hookform/resolvers/zod'
import { PencilIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildDealSchema,
  type Deal,
  DealFields,
  dealFormValues,
  type DealFormValues,
  toDealBody,
  useUpdateDeal,
} from '@/entities/deal'
import { isConflict } from '@/shared/api/api-error'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Button } from '@/shared/ui/button'
import { FormSheet } from '@/shared/ui/form-sheet'

/** Edits the deal's own fields with its `version`; the stage changes through a move. */
export function EditDealButton({ deal }: { deal: Deal }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        <PencilIcon aria-hidden="true" />
        {t('sales.deal.edit')}
      </Button>
      {open && (
        <EditDealSheet
          deal={deal}
          onClose={() => {
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function EditDealSheet({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { t } = useTranslation()
  const { formatPhone } = useTenantFormat()
  const schema = useMemo(() => buildDealSchema(), [])
  const form = useForm<DealFormValues>({
    resolver: zodResolver(schema),
    defaultValues: dealFormValues(deal, formatPhone),
  })
  const update = useUpdateDeal()

  const submit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        id: deal.id,
        body: {
          ...toDealBody(values, {
            source: deal.source,
            ownerUserId: deal.owner?.id,
            keepStage: true,
          }),
          version: deal.version,
        },
      })
      toast.success(t('sales.deal.saved'))
      onClose()
    } catch (error) {
      // A stale version has been told and refetched by the hook; the form stays open
      if (isConflict(error)) return
      reportSaveError(error, form, t('sales.deal.saveFailed'))
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
        title={t('sales.deal.editTitle')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <DealFields />
      </FormSheet>
    </FormProvider>
  )
}
