import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useController, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type CatalogItem, useAddJobMaterial, useListCatalogItems } from '@/entities/report'
import { ApiError, isConflict } from '@/shared/api/api-error'
import { applyFieldErrors } from '@/shared/lib/form-errors'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { ChoiceGroup } from '@/shared/ui/choice-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { FieldError } from '@/shared/ui/field'
import { Input } from '@/shared/ui/input'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

import {
  buildMaterialSchema,
  emptyMaterialForm,
  type MaterialFormValues,
  toMaterialInput,
} from '../model/material-form'

const FIELDS = ['catalogItemId', 'name', 'unit', 'unitPrice', 'quantity'] as const

/** Adds a material from the tenant's catalog, or free text for what it does not list. */
export function AddMaterialDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const add = useAddJobMaterial(jobId)
  const schema = useMemo(() => buildMaterialSchema(), [])
  const methods = useForm<MaterialFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyMaterialForm,
  })
  const mode = useWatch({ control: methods.control, name: 'mode' })

  const submit = methods.handleSubmit(async (values) => {
    try {
      await add.mutateAsync(toMaterialInput(values))
      toast.success(t('report.materials.added'))
      onClose()
    } catch (error) {
      if (isConflict(error)) {
        onClose()
      } else if (error instanceof ApiError && error.status === 400) {
        // The API names `catalogItemId`, `name`, `unit`, `unitPrice` and `quantity` like the form
        const unmatched = applyFieldErrors(methods.setError, error.fieldErrors, FIELDS)
        toast.error(
          unmatched.length > 0 ? unmatched.join(' ') : t('report.materials.dialog.failed'),
        )
      } else {
        toast.error(t('report.materials.dialog.failed'))
      }
    }
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <FormProvider {...methods}>
          <form noValidate className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t('report.materials.dialog.title')}</DialogTitle>
              <DialogDescription className="sr-only">
                {t('report.materials.dialog.title')}
              </DialogDescription>
            </DialogHeader>
            <ChoiceGroup
              name="mode"
              legend={t('report.materials.title')}
              choices={[
                { value: 'catalog', label: t('report.materials.dialog.fromCatalog') },
                { value: 'custom', label: t('report.materials.dialog.custom') },
              ]}
            />
            {mode === 'catalog' ? (
              <CatalogPicker />
            ) : (
              <div className="grid gap-4">
                <TextField name="name" label={t('report.materials.dialog.name')} required />
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="unit" label={t('report.materials.dialog.unit')} required />
                  <TextField
                    name="unitPrice"
                    label={t('report.materials.dialog.unitPrice')}
                    inputMode="decimal"
                  />
                </div>
              </div>
            )}
            <TextField
              name="quantity"
              label={t('report.materials.dialog.quantity')}
              inputMode="decimal"
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="lg" disabled={methods.formState.isSubmitting}>
                {methods.formState.isSubmitting
                  ? t('report.materials.dialog.adding')
                  : t('report.materials.dialog.submit')}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}

/** A search of the tenant's catalog; choosing an item sets `catalogItemId`. */
function CatalogPicker() {
  const { t } = useTranslation()
  const { formatMoney } = useTenantFormat()
  const { field, fieldState } = useController<MaterialFormValues, 'catalogItemId'>({
    name: 'catalogItemId',
  })
  const [chosen, setChosen] = useState<CatalogItem | null>(null)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim())
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [text])
  const catalog = useListCatalogItems({ q: query || undefined, pageSize: 20 })

  if (chosen) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <span>
          {t('report.materials.dialog.chosen', { name: chosen.name })}
          <span className="block text-xs text-muted-foreground">
            {formatMoney(chosen.price)} / {chosen.unit}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setChosen(null)
            field.onChange('')
          }}
        >
          {t('report.materials.dialog.change')}
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <Input
        type="search"
        className="h-12 text-base"
        aria-label={t('report.materials.dialog.search')}
        placeholder={t('report.materials.dialog.search')}
        value={text}
        onChange={(event) => {
          setText(event.target.value)
        }}
      />
      {catalog.isPending ? (
        <Skeleton className="h-24" />
      ) : catalog.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{t('report.materials.dialog.loadFailed')}</AlertDescription>
        </Alert>
      ) : catalog.data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('report.materials.dialog.noResults')}</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {catalog.data.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setChosen(item)
                  field.onChange(item.id)
                }}
              >
                <span>
                  {item.name}
                  <span className="block text-xs text-muted-foreground">{item.sku}</span>
                </span>
                <span className="text-sm tabular-nums">
                  {formatMoney(item.price)} / {item.unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <FieldError>{fieldState.error?.message}</FieldError>
    </div>
  )
}
