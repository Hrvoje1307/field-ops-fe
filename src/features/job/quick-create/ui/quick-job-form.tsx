import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { type CustomFieldScope, useListCustomFieldDefinitions } from '@/entities/custom-field'
import { activeJobTypes, type JobType, useListJobTypes } from '@/entities/job-type'
import { useTenantFormat } from '@/shared/lib/tenant-format'
import { Alert, AlertAction, AlertDescription } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'

import {
  buildQuickJobSchema,
  emptyQuickJob,
  type QuickJobDefinitions,
  type QuickJobFormValues,
  type QuickJobValues,
} from '../model/schema'
import { useSaveQuickJob } from '../model/use-save-quick-job'
import { ClientPicker } from './client-picker'
import { FormSection } from './form-parts'
import { JobFields } from './job-fields'
import { LocationPicker } from './location-picker'

const SCOPES = {
  client: { entity: 'client' },
  location: { entity: 'location' },
  job: { entity: 'job' },
} as const satisfies Record<keyof QuickJobDefinitions, CustomFieldScope>

/**
 * Quick job entry for the office, e.g. while the client is on the phone: find or
 * enter the client, pick or enter the location, describe the job, save.
 */
export function QuickJobForm({
  clientId,
}: {
  /** Start with this client chosen. */ clientId?: string
}) {
  const { t } = useTranslation()
  const client = useListCustomFieldDefinitions(SCOPES.client)
  const location = useListCustomFieldDefinitions(SCOPES.location)
  const job = useListCustomFieldDefinitions(SCOPES.job)
  const jobTypes = useListJobTypes()

  const definitions = useMemo<QuickJobDefinitions | null>(
    () =>
      client.data && location.data && job.data
        ? { client: client.data, location: location.data, job: job.data }
        : null,
    [client.data, location.data, job.data],
  )

  if (client.isError || location.isError || job.isError || jobTypes.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('job.create.errors.jobFailed')}</AlertDescription>
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
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
    )
  }
  if (!definitions || !jobTypes.data) {
    return (
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  return (
    <Form definitions={definitions} jobTypes={activeJobTypes(jobTypes.data)} clientId={clientId} />
  )
}

function Form({
  definitions,
  jobTypes,
  clientId,
}: {
  definitions: QuickJobDefinitions
  jobTypes: readonly JobType[]
  clientId: string | undefined
}) {
  const { t } = useTranslation()
  const { locale, country } = useTenantFormat()
  const schema = useMemo(() => buildQuickJobSchema(definitions), [definitions])
  const form = useForm<QuickJobFormValues, unknown, QuickJobValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyQuickJob(definitions, { locale, clientId }),
  })
  const save = useSaveQuickJob({ form, definitions, country })
  const submit = form.handleSubmit(save)
  const { isSubmitting } = form.formState

  return (
    <FormProvider {...form}>
      <form noValidate className="space-y-6" onSubmit={(event) => void submit(event)}>
        <FormSection title={t('job.create.clientSection')}>
          <ClientPicker definitions={definitions} />
        </FormSection>
        <FormSection title={t('job.create.locationSection')}>
          <LocationPicker definitions={definitions} />
        </FormSection>
        <FormSection title={t('job.create.jobSection')}>
          <JobFields definitions={definitions} jobTypes={jobTypes} />
        </FormSection>
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? t('job.create.saving') : t('job.create.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
