import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  type CustomFieldScope,
  customFieldPaths,
  useListCustomFieldDefinitions,
} from '@/entities/custom-field'
import { type Deal, type DealConvertRequest, useConvertDeal, useGetDeal } from '@/entities/deal'
import { activeJobTypes, type JobType, useListJobTypes } from '@/entities/job-type'
import { useCreateLocation } from '@/entities/location'
import {
  buildQuickJobSchema,
  ClientPicker,
  type ClientHints,
  emptyQuickJob,
  formFieldPaths,
  FormSection,
  JobFields,
  LocationPicker,
  locationErrorPath,
  toClientCreate,
  toFormErrors,
  toLocationInput,
  type QuickJobDefinitions,
  type QuickJobFormValues,
  type QuickJobValues,
} from '@/features/job/quick-create'
import { ApiError } from '@/shared/api/api-error'
import { applyFieldErrors } from '@/shared/lib/form-errors'
import { isPlainDate } from '@/shared/lib/datetime'
import { salesErrorCode, salesErrorMessage } from '@/shared/lib/sales-error'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { FormSheet } from '@/shared/ui/form-sheet'
import { Skeleton } from '@/shared/ui/skeleton'

import { toConvertFormErrors, toConvertJob } from '../lib/requests'

const SCOPES = {
  client: { entity: 'client' },
  location: { entity: 'location' },
  job: { entity: 'job' },
} as const satisfies Record<keyof QuickJobDefinitions, CustomFieldScope>

/**
 * Turns a deal into a client (existing or new), a location and a job, in one request.
 * Everything known about the deal is filled in; the user always confirms the client's
 * fields and a client is never chosen for them.
 */
export function ConvertDealSheet({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const deal = useGetDeal(dealId)
  const client = useListCustomFieldDefinitions(SCOPES.client)
  const location = useListCustomFieldDefinitions(SCOPES.location)
  const job = useListCustomFieldDefinitions(SCOPES.job)
  const jobTypes = useListJobTypes()

  const failed =
    deal.isError || client.isError || location.isError || job.isError || jobTypes.isError
  const ready =
    deal.data && client.data && location.data && job.data && jobTypes.data
      ? {
          deal: deal.data,
          definitions: { client: client.data, location: location.data, job: job.data },
          jobTypes: activeJobTypes(jobTypes.data),
        }
      : null

  if (ready) {
    return (
      <Form
        deal={ready.deal}
        definitions={ready.definitions}
        jobTypes={ready.jobTypes}
        onClose={onClose}
      />
    )
  }
  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('sales.convert.title')}
      onSubmit={(event) => {
        event.preventDefault()
      }}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {failed ? (
        <Alert variant="destructive">
          <AlertDescription>{t('sales.convert.loadFailed')}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void deal.refetch()
                void client.refetch()
                void location.refetch()
                void job.refetch()
                void jobTypes.refetch()
              }}
            >
              {t('common.retry')}
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      )}
    </FormSheet>
  )
}

/** What the deal and the conversation it came from already tell about the client. */
function hintsOf(deal: Deal): ClientHints {
  const e = deal.extracted
  const company = e?.companyName ?? null
  return {
    type: company ? 'company' : 'person',
    name: deal.client?.name ?? company ?? deal.contactName ?? e?.name ?? null,
    contactName: company ? (deal.contactName ?? e?.name ?? null) : null,
    phone: deal.contactPhone ?? e?.phone ?? null,
    email: deal.contactEmail ?? e?.email ?? null,
    street: e?.street ?? null,
    city: e?.city ?? null,
  }
}

function Form({
  deal,
  definitions,
  jobTypes,
  onClose,
}: {
  deal: Deal
  definitions: QuickJobDefinitions
  jobTypes: readonly JobType[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { locale, country } = useTenantFormat()
  const navigate = useNavigate()
  const schema = useMemo(() => buildQuickJobSchema(definitions), [definitions])
  const hints = useMemo(() => hintsOf(deal), [deal])
  const knownPaths = useMemo(
    () =>
      formFieldPaths({
        client: customFieldPaths(definitions.client, 'client.customFields'),
        location: customFieldPaths(definitions.location, 'location.customFields'),
        job: customFieldPaths(definitions.job, 'job.customFields'),
      }),
    [definitions],
  )
  const form = useForm<QuickJobFormValues, unknown, QuickJobValues>({
    resolver: zodResolver(schema),
    defaultValues: useMemo(() => {
      const start = emptyQuickJob(definitions, { locale, clientId: deal.client?.id })
      const preferred = deal.extracted?.preferredDate
      return {
        ...start,
        job: {
          ...start.job,
          title: deal.title,
          description: deal.extracted?.request ?? '',
          preferredDate: preferred && isPlainDate(preferred) ? preferred : '',
        },
      }
    }, [definitions, locale, deal.client?.id, deal.title, deal.extracted]),
  })
  const convert = useConvertDeal()
  const createLocation = useCreateLocation()
  // The version is read when sending: after a 409 the refetched deal has the new one
  const latest = useGetDeal(deal.id)

  function report(error: unknown, isCompany: boolean) {
    if (error instanceof ApiError && error.status === 400) {
      const fieldErrors = error.fieldErrors
      if (Object.keys(fieldErrors).length > 0) {
        const unmatched = applyFieldErrors(
          form.setError,
          toConvertFormErrors(fieldErrors, isCompany),
          knownPaths,
        )
        if (unmatched.length > 0) toast.error(unmatched.join(' '))
        return
      }
    }
    if (salesErrorCode(error) === 'sales.deal_already_converted') {
      toast.error(salesErrorMessage(error))
      onClose()
      return
    }
    // A stale version has been told by the hook; the form stays as it is
    if (error instanceof ApiError && error.status === 409) return
    toast.error(salesErrorCode(error) ? salesErrorMessage(error) : t('sales.convert.failed'))
  }

  const submit = form.handleSubmit(async (values) => {
    const version = (latest.data ?? deal).version
    const job = toConvertJob(values.job)
    const isCompany = values.client.kind === 'new' && values.client.type === 'company'
    let body: DealConvertRequest
    if (values.client.kind === 'new') {
      if (values.location.kind !== 'new') return
      body = { newClient: toClientCreate(values.client, values.location, country), job, version }
    } else {
      const clientId = values.client.clientId
      let locationId: string
      if (values.location.kind === 'new') {
        // The request takes an existing location of the client, so a new one is saved first
        try {
          const saved = await createLocation.mutateAsync({
            clientId,
            body: toLocationInput(values.location, country),
          })
          locationId = saved.id
          form.setValue('location', { kind: 'existing', locationId })
        } catch (error) {
          if (
            error instanceof ApiError &&
            error.status === 400 &&
            Object.keys(error.fieldErrors).length > 0
          ) {
            const unmatched = applyFieldErrors(
              form.setError,
              toFormErrors(error.fieldErrors, locationErrorPath),
              knownPaths,
            )
            if (unmatched.length > 0) toast.error(unmatched.join(' '))
          } else toast.error(t('job.create.errors.locationFailed'))
          return
        }
      } else locationId = values.location.locationId
      body = { clientId, locationId, job, version }
    }
    try {
      const result = await convert.mutateAsync({ id: deal.id, body })
      toast.success(t('sales.convert.doneNoNumber'), {
        action: {
          label: t('sales.convert.openJob'),
          onClick: () => {
            void navigate({ to: '/jobs/$jobId', params: { jobId: result.jobId } })
          },
        },
      })
      onClose()
    } catch (error) {
      report(error, isCompany)
    }
  })

  return (
    <FormProvider {...form}>
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={t('sales.convert.title')}
        description={t('sales.convert.description')}
        onSubmit={(event) => void submit(event)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? t('sales.convert.converting')
                : t('sales.convert.convert')}
            </Button>
          </>
        }
      >
        <FormSection title={t('sales.convert.clientSection')}>
          <ClientPicker definitions={definitions} hints={hints} />
        </FormSection>
        <FormSection title={t('sales.convert.locationSection')}>
          <LocationPicker definitions={definitions} withAssets={false} />
        </FormSection>
        <FormSection title={t('sales.convert.jobSection')}>
          <JobFields definitions={definitions} jobTypes={jobTypes} basic />
        </FormSection>
      </FormSheet>
    </FormProvider>
  )
}
