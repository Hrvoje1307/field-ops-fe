import { useQuery } from '@tanstack/react-query'

import { CLIENT_STALE_TIME, clientKeys, getClient, listClients } from '@/entities/client'
import type { CustomFieldScope, CustomFieldValues } from '@/entities/custom-field'
import {
  getJob,
  JOB_DETAIL_STALE_TIME,
  JOB_LIST_STALE_TIME,
  jobKeys,
  listJobs,
} from '@/entities/job'
import { locationAddress } from '@/entities/location'

/** Just the first record. */
const FIRST = { pageSize: 1 }

export interface Sample {
  /** Which record the values come from. */
  name: string
  values: CustomFieldValues
}

/**
 * Real values to start from: the first client (by name) and its first location, the
 * first of its assets of the chosen type, or the newest job. `null` when there is none
 * (or the user may not read it).
 */
export function useSample(scope: CustomFieldScope): { pending: boolean; sample: Sample | null } {
  const fromClient = scope.entity !== 'job'
  const clients = useQuery({
    queryKey: clientKeys.list(FIRST),
    queryFn: async ({ signal }) => {
      return listClients(FIRST, signal)
    },
    staleTime: CLIENT_STALE_TIME,
    enabled: fromClient,
  })
  const clientId = clients.data?.items[0]?.id ?? ''
  const client = useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async ({ signal }) => {
      return getClient(clientId, signal)
    },
    staleTime: CLIENT_STALE_TIME,
    enabled: fromClient && clientId !== '',
  })

  const jobs = useQuery({
    queryKey: jobKeys.list(FIRST),
    queryFn: async ({ signal }) => {
      return listJobs(FIRST, signal)
    },
    staleTime: JOB_LIST_STALE_TIME,
    enabled: !fromClient,
  })
  const jobId = jobs.data?.items[0]?.id ?? ''
  const job = useQuery({
    queryKey: jobKeys.detail(jobId),
    queryFn: async ({ signal }) => {
      return getJob(jobId, signal)
    },
    staleTime: JOB_DETAIL_STALE_TIME,
    enabled: !fromClient && jobId !== '',
  })

  const list = fromClient ? clients : jobs
  const detail = fromClient ? client : job
  const none = { pending: false, sample: null }
  if (list.isError || detail.isError) return none
  if (list.isPending) return { pending: true, sample: null }
  if (list.data.items.length === 0) return none
  if (detail.isPending) return { pending: true, sample: null }

  switch (scope.entity) {
    case 'client':
      return {
        pending: false,
        sample: client.data ? { name: client.data.name, values: client.data.customFields } : null,
      }
    case 'location': {
      const location = client.data?.locations[0]
      return {
        pending: false,
        sample: location
          ? { name: locationAddress(location), values: location.customFields }
          : null,
      }
    }
    case 'asset': {
      const asset = client.data?.locations
        .flatMap((location) => location.assets ?? [])
        .find((candidate) => candidate.assetTypeId === scope.assetTypeId)
      const name = [asset?.manufacturer, asset?.model, asset?.serialNo].filter(Boolean).join(' ')
      return {
        pending: false,
        sample: asset ? { name, values: asset.customFields ?? {} } : null,
      }
    }
    case 'job':
      return {
        pending: false,
        sample: job.data
          ? { name: `${job.data.number} ${job.data.title}`, values: job.data.customFields }
          : null,
      }
  }
}
