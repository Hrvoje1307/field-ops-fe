import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, path } from '@/shared/api/api-fetch'
import { isConflict } from '@/shared/api/api-error'
import type {
  MessageTemplate,
  MessageTemplateInput,
  PreviewMessageTemplate200,
  PreviewMessageTemplateBody,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'
import { invalidateRoots } from '@/shared/api/query-roots'

import { MESSAGE_PREVIEW_STALE_TIME, MESSAGE_TEMPLATES_STALE_TIME } from './const'

export const messageTemplateKeys = {
  all: ['message-templates'] as const,
  preview: (body: string) => ['message-templates', 'preview', body] as const,
}

// --- GET / reads (used as queryFn) -------------------------------------------

/** The templates in effect: the tenant's own and, where it has none, the platform's. */
export async function listMessageTemplates(signal?: AbortSignal) {
  return apiFetch<MessageTemplate[]>('/message-templates', { signal })
}

/** A text with its placeholders filled from sample data, and its SMS length. */
export async function previewMessageTemplate(
  body: PreviewMessageTemplateBody,
  signal?: AbortSignal,
) {
  return apiFetch<PreviewMessageTemplate200>('/message-templates/preview', {
    method: 'POST',
    json: body,
    signal,
  })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

/** The tenant's own text for a key and channel (409 when it already has one). */
export async function createMessageTemplate(body: MessageTemplateInput, idempotencyKey?: string) {
  return apiFetch<MessageTemplate>('/message-templates', {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

/** Only the tenant's own templates; a platform default has to be written over (POST). */
export async function updateMessageTemplate(
  id: string,
  body: MessageTemplateInput,
  idempotencyKey?: string,
) {
  return apiFetch<MessageTemplate>(path`/message-templates/${id}`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** The platform default takes its place again. */
export async function deleteMessageTemplate(id: string) {
  return apiFetch<undefined>(path`/message-templates/${id}`, { method: 'DELETE' })
}

// --- Hooks (what features and widgets call) ---------------------------------

export function useListMessageTemplates() {
  return useQuery({
    queryKey: messageTemplateKeys.all,
    queryFn: ({ signal }) => listMessageTemplates(signal),
    staleTime: MESSAGE_TEMPLATES_STALE_TIME,
  })
}

/** What `body` looks like with sample data. Waits while there is nothing to show. */
export function usePreviewMessageTemplate(body: string) {
  return useQuery({
    queryKey: messageTemplateKeys.preview(body),
    queryFn: ({ signal }) => previewMessageTemplate({ body }, signal),
    enabled: body.trim() !== '',
    staleTime: MESSAGE_PREVIEW_STALE_TIME,
    // The last preview stays up while the next one is on its way
    placeholderData: keepPreviousData,
  })
}

export function useCreateMessageTemplate() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: MessageTemplateInput) =>
      createMessageTemplate(body, idempotency.keyFor(body)),
    onSuccess: (_saved, body, _result, { client }) => {
      idempotency.forget(body)
      void invalidateRoots(client, ['message-templates'])
    },
    // Someone wrote it meanwhile: the list shows theirs now
    onError: (error, _body, _result, { client }) =>
      isConflict(error) ? invalidateRoots(client, ['message-templates']) : undefined,
  })
}

export function useUpdateMessageTemplate() {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (request: { id: string; body: MessageTemplateInput }) =>
      updateMessageTemplate(request.id, request.body, idempotency.keyFor(request)),
    onSuccess: (_saved, request, _result, { client }) => {
      idempotency.forget(request)
      void invalidateRoots(client, ['message-templates'])
    },
  })
}

export function useDeleteMessageTemplate() {
  return useMutation({
    mutationFn: (id: string) => deleteMessageTemplate(id),
    onSuccess: (_nothing, _id, _result, { client }) =>
      invalidateRoots(client, ['message-templates']),
  })
}
