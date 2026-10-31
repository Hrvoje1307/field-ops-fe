import { zodResolver } from '@hookform/resolvers/zod'
import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  buildDealSchema,
  DealFields,
  dealFormValues,
  type DealFormValues,
  toDealBody,
  useCreateDeal,
} from '@/entities/deal'
import { useListSalesStages } from '@/entities/sales-stage'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { Button } from '@/shared/ui/button'
import { FormSheet } from '@/shared/ui/form-sheet'

/** "Nova prilika": a deal entered by hand (source `manual`). */
export function CreateDealButton({
  variant = 'default',
  onCreated,
}: {
  variant?: 'default' | 'outline'
  onCreated?: (dealId: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={variant}
        onClick={() => {
          setOpen(true)
        }}
      >
        <PlusIcon aria-hidden="true" />
        {t('sales.deal.new')}
      </Button>
      {open && (
        <CreateDealSheet
          onClose={() => {
            setOpen(false)
          }}
          onCreated={onCreated}
        />
      )}
    </>
  )
}

function CreateDealSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated?: (dealId: string) => void
}) {
  const { t } = useTranslation()
  const stages = useListSalesStages()
  const open = useMemo(
    () => (stages.data ?? []).filter((s) => s.kind === 'open' && s.isActive),
    [stages.data],
  )
  const schema = useMemo(() => buildDealSchema(), [])
  const form = useForm<DealFormValues>({
    resolver: zodResolver(schema),
    defaultValues: dealFormValues(),
  })
  const create = useCreateDeal()

  const submit = form.handleSubmit(async (values) => {
    try {
      const deal = await create.mutateAsync(toDealBody(values, { source: 'manual' }))
      toast.success(t('sales.deal.created'))
      onClose()
      onCreated?.(deal.id)
    } catch (error) {
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
        title={t('sales.deal.newTitle')}
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
        <DealFields stages={open} />
      </FormSheet>
    </FormProvider>
  )
}
