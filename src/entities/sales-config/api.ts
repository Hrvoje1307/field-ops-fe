import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  ExclusionRule,
  ExclusionRuleInput,
  FollowUpRule,
  FollowUpRuleInput,
  SalesSettings,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots, SALES_DATA_ROOTS } from '@/shared/api/query-roots'

import { SALES_CONFIG_STALE_TIME } from './const'

export const salesConfigKeys = {
  all: ['sales-config'] as const,
  settings: ['sales-config', 'settings'] as const,
  followUpRules: ['sales-config', 'follow-up-rules'] as const,
  exclusions: ['sales-config', 'exclusions'] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

export async function getSalesSettings(signal?: AbortSignal) {
  return apiFetch<SalesSettings>('/sales/settings', { signal })
}

export async function listFollowUpRules(signal?: AbortSignal) {
  return apiFetch<FollowUpRule[]>('/sales/follow-up-rules', { signal })
}

/** Senders and domains that are never processed. */
export async function listExclusionRules(signal?: AbortSignal) {
  return apiFetch<ExclusionRule[]>('/sales/exclusions', { signal })
}

// --- PUT / POST / DELETE (used as mutationFn) --------------------------------

/** Owner only. Full replacement. */
export async function updateSalesSettings(body: SalesSettings, idempotencyKey?: string) {
  return apiFetch<SalesSettings>('/sales/settings', {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. */
export async function createFollowUpRule(body: FollowUpRuleInput, idempotencyKey?: string) {
  return apiFetch<FollowUpRule>('/sales/follow-up-rules', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. */
export async function updateFollowUpRule(
  id: string,
  body: FollowUpRuleInput,
  idempotencyKey?: string,
) {
  return apiFetch<FollowUpRule>(path`/sales/follow-up-rules/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. */
export async function deleteFollowUpRule(id: string) {
  return apiFetch<undefined>(path`/sales/follow-up-rules/${id}`, { method: 'DELETE' })
}

/** Owner only. `pattern` is an address or `@domain`. */
export async function createExclusionRule(body: ExclusionRuleInput, idempotencyKey?: string) {
  return apiFetch<ExclusionRule>('/sales/exclusions', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Owner only. */
export async function deleteExclusionRule(id: string) {
  return apiFetch<undefined>(path`/sales/exclusions/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useGetSalesSettings() {
  return useQuery({
    queryKey: salesConfigKeys.settings,
    queryFn: ({ signal }) => getSalesSettings(signal),
    staleTime: SALES_CONFIG_STALE_TIME,
  })
}

export function useListFollowUpRules() {
  return useQuery({
    queryKey: salesConfigKeys.followUpRules,
    queryFn: ({ signal }) => listFollowUpRules(signal),
    staleTime: SALES_CONFIG_STALE_TIME,
  })
}

export function useListExclusionRules() {
  return useQuery({
    queryKey: salesConfigKeys.exclusions,
    queryFn: ({ signal }) => listExclusionRules(signal),
    staleTime: SALES_CONFIG_STALE_TIME,
  })
}

/** The review threshold, response time and AI switches change what the inbox and Today show. */
export function useUpdateSalesSettings() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: SalesSettings) => updateSalesSettings(body, idempotency.keyFor(body)),
    onSuccess: (settings, body, _result, { client }) => {
      idempotency.forget(body)
      client.setQueryData(salesConfigKeys.settings, settings)
      void invalidateRoots(client, SALES_DATA_ROOTS)
    },
  })
}

export function useCreateFollowUpRule() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: FollowUpRuleInput) => createFollowUpRule(body, idempotency.keyFor(body)),
    onSuccess: (_rule, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, ['sales-config', 'deals'])
    },
  })
}

export function useUpdateFollowUpRule() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: FollowUpRuleInput }) =>
      updateFollowUpRule(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_rule, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, ['sales-config', 'deals'])
    },
  })
}

export function useDeleteFollowUpRule() {
  return useMutation({
    mutationFn: (id: string) => deleteFollowUpRule(id),
    onSuccess: (_nothing, _id, _result, { client }) =>
      invalidateRoots(client, ['sales-config', 'deals']),
  })
}

export function useCreateExclusionRule() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: ExclusionRuleInput) => createExclusionRule(body, idempotency.keyFor(body)),
    onSuccess: (_rule, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, ['sales-config'])
    },
  })
}

export function useDeleteExclusionRule() {
  return useMutation({
    mutationFn: (id: string) => deleteExclusionRule(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, ['sales-config']),
  })
}
