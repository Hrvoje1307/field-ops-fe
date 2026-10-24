import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { type ClientCreate, clientKeys, createClient } from '@/entities/client'
import { customFieldPaths } from '@/entities/custom-field'
import { createJob, invalidateJobData, type JobCreate } from '@/entities/job'
import { createLocation, type LocationInput } from '@/entities/location'
import { ApiError } from '@/shared/api/api-error'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { applyFieldErrors } from '@/shared/lib/form-errors'

import {
  clientErrorPath,
  formFieldPaths,
  jobErrorPath,
  locationErrorPath,
  toFormErrors,
} from '../lib/error-paths'
import { toClientCreate, toJobCreate, toLocationInput } from '../lib/requests'
import type { QuickJobDefinitions, QuickJobFormValues, QuickJobValues } from './schema'

type FailedStep = 'clientFailed' | 'locationFailed' | 'jobFailed'

/**
 * Saves the form: a new client (with its first location) or a new location first,
 * then the job. Once the client or location is saved the form switches to it, so
 * trying again after a failed job only sends the job. Each request keeps its
 * idempotency key while it is retried unchanged.
 */
export function useSaveQuickJob({
  form,
  definitions,
  country,
}: {
  form: UseFormReturn<QuickJobFormValues, unknown, QuickJobValues>
  definitions: QuickJobDefinitions
  country: string | undefined
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const idempotency = useIdempotencyKeys()

  const saveClient = useMutation({
    mutationFn: ({ body, key }: { body: ClientCreate; key: string }) => createClient(body, key),
  })
  const saveLocation = useMutation({
    mutationFn: ({ clientId, body, key }: { clientId: string; body: LocationInput; key: string }) =>
      createLocation(clientId, body, key),
  })
  const saveJob = useMutation({
    mutationFn: ({ body, key }: { body: JobCreate; key: string }) => createJob(body, key),
  })

  const knownPaths = useMemo(
    () =>
      formFieldPaths({
        client: customFieldPaths(definitions.client, 'client.customFields'),
        location: customFieldPaths(definitions.location, 'location.customFields'),
        job: customFieldPaths(definitions.job, 'job.customFields'),
      }),
    [definitions],
  )

  /** 400: messages next to the inputs (the rest as a toast); anything else: a toast. */
  const report = (error: unknown, toPath: (path: string) => string, step: FailedStep) => {
    if (error instanceof ApiError && error.status === 400) {
      const fieldErrors = error.fieldErrors
      if (Object.keys(fieldErrors).length > 0) {
        const unmatched = applyFieldErrors(
          form.setError,
          toFormErrors(fieldErrors, toPath),
          knownPaths,
        )
        if (unmatched.length > 0) toast.error(unmatched.join(' '))
        return
      }
    }
    toast.error(t(`job.create.errors.${step}`))
  }

  return async (values: QuickJobValues): Promise<void> => {
    let clientId: string
    let locationId: string

    if (values.client.kind === 'new') {
      // A new client always comes with its first location
      if (values.location.kind !== 'new') return
      const body = toClientCreate(values.client, values.location, country)
      const isCompany = values.client.type === 'company'
      let client
      try {
        client = await saveClient.mutateAsync({ body, key: idempotency.keyFor(body) })
      } catch (error) {
        report(error, (path) => clientErrorPath(path, { isCompany }), 'clientFailed')
        return
      }
      idempotency.forget(body)
      queryClient.setQueryData(clientKeys.detail(client.id), client)
      const firstLocation = client.locations[0]
      form.setValue('client', { kind: 'existing', clientId: client.id })
      if (firstLocation)
        form.setValue('location', { kind: 'existing', locationId: firstLocation.id })
      toast.success(t('job.create.clientCreated', { name: client.name }))
      if (!firstLocation) return
      clientId = client.id
      locationId = firstLocation.id
    } else {
      clientId = values.client.clientId
      if (values.location.kind === 'new') {
        const request = { clientId, body: toLocationInput(values.location, country) }
        let location
        try {
          location = await saveLocation.mutateAsync({
            ...request,
            key: idempotency.keyFor(request),
          })
        } catch (error) {
          report(error, locationErrorPath, 'locationFailed')
          return
        }
        idempotency.forget(request)
        void queryClient.invalidateQueries({ queryKey: clientKeys.detail(clientId) })
        form.setValue('location', { kind: 'existing', locationId: location.id })
        locationId = location.id
      } else {
        locationId = values.location.locationId
      }
    }

    const body = toJobCreate(values.job, { clientId, locationId, assetId: values.assetId })
    let job
    try {
      job = await saveJob.mutateAsync({ body, key: idempotency.keyFor(body) })
    } catch (error) {
      report(error, jobErrorPath, 'jobFailed')
      return
    }
    idempotency.forget(body)
    void invalidateJobData(queryClient)
    toast.success(t('job.create.created', { number: job.number }))
    void navigate({ to: '/jobs/$jobId', params: { jobId: job.id } })
  }
}
