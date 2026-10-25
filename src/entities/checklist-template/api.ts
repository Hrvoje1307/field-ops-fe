import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import type { ChecklistTemplate, ChecklistTemplateInput } from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots } from '@/shared/api/query-roots'

import { CHECKLIST_TEMPLATES_STALE_TIME } from './const'

export const checklistTemplateKeys = {
  all: ['checklist-templates'] as const,
}

/** Job types point at a template, and a deleted one is taken off them. */
const TEMPLATE_ROOTS = ['checklist-templates', 'job-types']

// --- GET (used as queryFn) ---------------------------------------------------

export async function listChecklistTemplates(signal?: AbortSignal) {
  return apiFetch<ChecklistTemplate[]>('/checklist-templates', { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function createChecklistTemplate(
  body: ChecklistTemplateInput,
  idempotencyKey?: string,
) {
  return apiFetch<ChecklistTemplate>('/checklist-templates', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Only jobs created afterwards get the new items; existing jobs keep their own copy. */
export async function updateChecklistTemplate(
  id: string,
  body: ChecklistTemplateInput,
  idempotencyKey?: string,
) {
  return apiFetch<ChecklistTemplate>(path`/checklist-templates/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

export async function deleteChecklistTemplate(id: string) {
  return apiFetch<undefined>(path`/checklist-templates/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

/** The tenant's checklist templates (office only). */
export function useListChecklistTemplates() {
  return useQuery({
    queryKey: checklistTemplateKeys.all,
    queryFn: ({ signal }) => listChecklistTemplates(signal),
    staleTime: CHECKLIST_TEMPLATES_STALE_TIME,
  })
}

export function useCreateChecklistTemplate() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: ChecklistTemplateInput) =>
      createChecklistTemplate(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, TEMPLATE_ROOTS)
    },
  })
}

export function useUpdateChecklistTemplate() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: ChecklistTemplateInput }) =>
      updateChecklistTemplate(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, TEMPLATE_ROOTS)
    },
  })
}

export function useDeleteChecklistTemplate() {
  return useMutation({
    mutationFn: (id: string) => deleteChecklistTemplate(id),
    onSuccess: (_nothing, _id, _result, { client }) => invalidateRoots(client, TEMPLATE_ROOTS),
  })
}
