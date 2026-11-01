import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo, useState } from 'react'
import { FormProvider, useController, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSalesMembers } from '@/entities/member'
import {
  buildDigestSchema,
  type DataLoss,
  DataLossDialog,
  dataLossOf,
  digestFormValues,
  type DigestFields,
  type DigestFormValues,
  type SalesSettings,
  toDigestFields,
  useGetSalesSettings,
  useSaveSalesSettings,
} from '@/entities/sales-config'
import { reportSaveError } from '@/shared/lib/report-save-error'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { CheckboxField } from '@/shared/ui/checkbox-field'
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field'
import { FormSection } from '@/shared/ui/form-section'
import { Skeleton } from '@/shared/ui/skeleton'
import { TextField } from '@/shared/ui/text-field'

/**
 * The daily summary (on or off, when, to whom) and whether the content of conversations that
 * are not sales is kept. It writes only these fields of the settings record.
 */
export function SalesDigestSettings() {
  const { t } = useTranslation()
  const settings = useGetSalesSettings()
  const members = useSalesMembers()
  if (settings.data && members.data) {
    return <DigestBody settings={settings.data} memberIds={members.data.map((m) => m.userId)} />
  }
  if (settings.isError || members.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('sales.settings.loadFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void settings.refetch()
              void members.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  return <Skeleton className="h-72" />
}

function DigestBody({
  settings,
  memberIds,
}: {
  settings: SalesSettings
  memberIds: readonly string[]
}) {
  const { t } = useTranslation()
  const { timeZone } = useTenantFormat()
  const schema = useMemo(() => buildDigestSchema(), [])
  const form = useForm<DigestFormValues>({
    resolver: zodResolver(schema),
    defaultValues: digestFormValues(settings, memberIds),
  })
  const save = useSaveSalesSettings()
  const [pending, setPending] = useState<{ fields: DigestFields; loss: DataLoss[] } | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function write(fields: DigestFields) {
    try {
      const saved = await save.mutateAsync(fields)
      form.reset(digestFormValues(saved, memberIds))
      setPending(null)
      setConfirmError(null)
      toast.success(t('sales.settings.saved'))
    } catch (error) {
      const message = salesErrorCode(error)
        ? salesErrorMessage(error)
        : t('sales.settings.saveFailed')
      if (pending) setConfirmError(message)
      else reportSaveError(error, form, message)
    }
  }

  const submit = form.handleSubmit(async (values) => {
    const fields = toDigestFields(values)
    const loss = dataLossOf(settings, fields)
    if (loss.length > 0) {
      setPending({ fields, loss })
      return
    }
    await write(fields)
  })

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void submit(event)}
        className="max-w-3xl space-y-6"
        aria-label={t('sales.settings.digest.title')}
        noValidate
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('sales.settings.digest.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('sales.settings.digest.description')}</p>
        </div>

        <FormSection title={t('sales.settings.digest.section')}>
          <CheckboxField name="digestEnabled" label={t('sales.settings.digest.enabled')} />
          <TextField
            name="digestTime"
            type="time"
            label={t('sales.settings.digest.time')}
            hint={t('sales.settings.digest.timeHint', { zone: timeZone })}
            className="max-w-48"
          />
          <Recipients members={memberIds} />
        </FormSection>

        <FormSection title={t('sales.settings.digest.dataSection')}>
          <CheckboxField
            name="storeNonSalesBodies"
            label={t('sales.settings.digest.storeBodies')}
            hint={t('sales.settings.digest.storeBodiesHint')}
          />
        </FormSection>

        <div className="flex justify-end">
          <Button type="submit" disabled={form.formState.isSubmitting || save.isPending}>
            {form.formState.isSubmitting || save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
      <DataLossDialog
        loss={pending?.loss ?? []}
        pending={save.isPending}
        error={confirmError}
        onCancel={() => {
          setPending(null)
          setConfirmError(null)
        }}
        onConfirm={() => {
          if (pending) void write(pending.fields)
        }}
      />
    </FormProvider>
  )
}

/** The members with access to Prodaja, one checkbox each. */
function Recipients({ members }: { members: readonly string[] }) {
  const { t } = useTranslation()
  const groupId = useId()
  const list = useSalesMembers()
  const { field } = useController<DigestFormValues, 'digestRecipientIds'>({
    name: 'digestRecipientIds',
  })
  const chosen = field.value
  return (
    <Field role="group" aria-labelledby={`${groupId}-label`}>
      <FieldLabel id={`${groupId}-label`}>{t('sales.settings.digest.recipients')}</FieldLabel>
      <FieldDescription>{t('sales.settings.digest.recipientsHint')}</FieldDescription>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('sales.settings.digest.recipientsNone')}</p>
      ) : (
        <ul className="space-y-2">
          {(list.data ?? []).map((member) => {
            const id = `${groupId}-${member.userId}`
            return (
              <li key={member.userId} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={chosen.includes(member.userId)}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      checked === true
                        ? [...chosen, member.userId]
                        : chosen.filter((value) => value !== member.userId),
                    )
                  }}
                />
                <FieldLabel htmlFor={id} className="font-normal">
                  {member.fullName}
                </FieldLabel>
              </li>
            )
          })}
        </ul>
      )}
    </Field>
  )
}
