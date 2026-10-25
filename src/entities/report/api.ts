import { type QueryClient, useMutation, useQuery } from '@tanstack/react-query'

import { ApiError, isConflict } from '@/shared/api/api-error'
import { apiFetch, path } from '@/shared/api/api-fetch'
import type {
  Attachment,
  AttachmentOwnerType,
  CatalogItemPage,
  ChecklistItem,
  CreateUploadUrlBody,
  CreateUploadUrl201,
  GetAttachmentUrl200,
  JobMaterial,
  JobMaterialInput,
  JobReport,
  JobReportInput,
  ListCatalogItemsParams,
  UpdateJobChecklistBodyItem,
} from '@/shared/api/generated/model'
import { useIdempotencyKeys } from '@/shared/api/idempotency'

import {
  ATTACHMENT_URL_STALE_TIME,
  CATALOG_STALE_TIME,
  PDF_POLL_GIVE_UP_MS,
  PDF_POLL_MS,
  REPORT_STALE_TIME,
} from './const'
import { handleReportConflict } from './model/conflict'

/** Keys start with `reports`, which job data invalidation covers. */
export const reportKeys = {
  all: ['reports'] as const,
  job: (jobId: string) => ['reports', 'job', jobId] as const,
  catalog: (params: ListCatalogItemsParams) => ['reports', 'catalog', params] as const,
  attachmentUrl: (id: string) => ['reports', 'attachment-url', id] as const,
}

// --- GET (used as queryFn) ---------------------------------------------------

/** The report is created empty when the job has none yet. */
export async function getJobReport(jobId: string, signal?: AbortSignal) {
  return apiFetch<JobReport>(path`/jobs/${jobId}/report`, { signal })
}

export async function listCatalogItems(params: ListCatalogItemsParams, signal?: AbortSignal) {
  return apiFetch<CatalogItemPage>('/catalog-items', { query: params, signal })
}

/** A short-lived link to the file (5 minutes). */
export async function getAttachmentUrl(id: string, signal?: AbortSignal) {
  return apiFetch<GetAttachmentUrl200>(path`/attachments/${id}/url`, { signal })
}

/** The printable report: HTML, fetched with the token (a plain link would go without it). */
export async function printJobReport(jobId: string, signal?: AbortSignal) {
  return apiFetch<string>(path`/jobs/${jobId}/report/print`, { signal })
}

// --- POST / PUT / DELETE (used as mutationFn) --------------------------------

export async function saveJobReport(jobId: string, body: JobReportInput, idempotencyKey?: string) {
  return apiFetch<JobReport>(path`/jobs/${jobId}/report`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** Patch-style: only the listed items change; the answer is the whole list. */
export async function updateJobChecklist(
  jobId: string,
  body: UpdateJobChecklistBodyItem[],
  idempotencyKey?: string,
) {
  return apiFetch<ChecklistItem[]>(path`/jobs/${jobId}/checklist`, {
    method: 'PUT',
    json: body,
    idempotencyKey,
  })
}

/** From the catalog (`catalogItemId`) or free text (`name` and `unit`). */
export async function addJobMaterial(
  jobId: string,
  body: JobMaterialInput,
  idempotencyKey?: string,
) {
  return apiFetch<JobMaterial>(path`/jobs/${jobId}/materials`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

export async function deleteJobMaterial(jobId: string, materialId: string) {
  return apiFetch<undefined>(path`/jobs/${jobId}/materials/${materialId}`, { method: 'DELETE' })
}

/** Step 1 of a file upload: where to PUT the bytes, and with which headers. */
export async function createUploadUrl(body: CreateUploadUrlBody) {
  return apiFetch<CreateUploadUrl201>('/attachments/upload-url', { method: 'POST', json: body })
}

/** Step 3: the file is there; it becomes an attachment. */
export async function confirmAttachment(
  body: { attachmentId: string; takenAt?: string },
  idempotencyKey?: string,
) {
  return apiFetch<Attachment>('/attachments', { method: 'POST', json: body, idempotencyKey })
}

export async function deleteAttachment(id: string) {
  return apiFetch<undefined>(path`/attachments/${id}`, { method: 'DELETE' })
}

/** Links an uploaded signature to the report with the signer's name. */
export async function attachSignature(
  jobId: string,
  body: { attachmentId: string; signedByName: string },
  idempotencyKey?: string,
) {
  return apiFetch<JobReport>(path`/jobs/${jobId}/signature`, {
    method: 'POST',
    json: body,
    idempotencyKey,
  })
}

// --- Uploading a file ---------------------------------------------------------

interface UploadProgress {
  target: CreateUploadUrl201
  /** The bytes are in storage. */
  uploaded: boolean
  attachment?: Attachment
  /** Confirming twice must not make two attachments. */
  confirmKey: string
}

/**
 * What has been done for a file already, so trying again (after a network error)
 * continues where it stopped instead of starting a second upload.
 */
const progress = new WeakMap<Blob, UploadProgress>()

/** Step 2: the bytes go straight to storage with exactly the signed headers, no bearer token. */
async function putToStorage(target: CreateUploadUrl201, file: Blob, signal?: AbortSignal) {
  const response = await fetch(target.uploadUrl, {
    method: target.method,
    headers: target.headers,
    body: file,
    signal,
  })
  if (!response.ok) {
    throw new ApiError(response.status, { status: response.status, title: 'Upload failed' })
  }
}

export interface UploadRequest {
  ownerType: AttachmentOwnerType
  ownerId: string
  kind: CreateUploadUrlBody['kind']
  file: Blob
  fileName?: string
  /** When a photo was taken. */
  takenAt?: string
}

/** upload-url → PUT to storage → confirm. Trying again with the same `file` resumes. */
export async function uploadAttachment(
  { ownerType, ownerId, kind, file, fileName, takenAt }: UploadRequest,
  signal?: AbortSignal,
): Promise<Attachment> {
  let state = progress.get(file)
  if (state?.attachment) return state.attachment
  // An unused link that is about to expire is not worth reusing
  if (!state || Date.parse(state.target.expiresAt) - Date.now() < 60_000) {
    const body: CreateUploadUrlBody = {
      ownerType,
      ownerId,
      kind,
      mime: file.type as CreateUploadUrlBody['mime'],
      sizeBytes: file.size,
    }
    if (fileName) body.fileName = fileName
    state = {
      target: await createUploadUrl(body),
      uploaded: false,
      confirmKey: crypto.randomUUID(),
    }
    progress.set(file, state)
  }
  if (!state.uploaded) {
    await putToStorage(state.target, file, signal)
    state.uploaded = true
  }
  const confirmation: { attachmentId: string; takenAt?: string } = {
    attachmentId: state.target.attachmentId,
  }
  if (takenAt) confirmation.takenAt = takenAt
  state.attachment = await confirmAttachment(confirmation, state.confirmKey)
  return state.attachment
}

// --- Hooks (what features and widgets call) ---------------------------------

/**
 * The job's report: work done, times, checklist, materials, photos, signature. After
 * completion it is looked at again every few seconds until the PDF is ready.
 */
export function useGetJobReport(jobId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: reportKeys.job(jobId),
    queryFn: ({ signal }) => getJobReport(jobId, signal),
    staleTime: REPORT_STALE_TIME,
    enabled,
    refetchInterval: (query) => {
      const report = query.state.data
      if (!report?.completedAt || report.pdfAttachmentId) return false
      return Date.now() - Date.parse(report.completedAt) < PDF_POLL_GIVE_UP_MS ? PDF_POLL_MS : false
    },
  })
}

/** Materials from the catalog, searched by name or code. */
export function useListCatalogItems(
  params: ListCatalogItemsParams,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: reportKeys.catalog(params),
    queryFn: ({ signal }) => listCatalogItems(params, signal),
    staleTime: CATALOG_STALE_TIME,
    enabled,
  })
}

/** The link to a file (a photo, the signature, the PDF); it expires, so it is asked for again. */
export function useGetAttachmentUrl(id: string | null | undefined) {
  return useQuery({
    queryKey: reportKeys.attachmentUrl(id ?? ''),
    queryFn: ({ signal }) => getAttachmentUrl(id ?? '', signal),
    staleTime: ATTACHMENT_URL_STALE_TIME,
    enabled: Boolean(id),
  })
}

/** Where the report in the cache is replaced by what the API sent back. */
function putReport(client: QueryClient, report: JobReport) {
  client.setQueryData(reportKeys.job(report.jobId), report)
}

/**
 * Saves the draft fields. What is sent shows in the cached report at once (so coming
 * back to the screen before the answer shows what was typed) and is taken back if the
 * save fails; the saved report replaces it. A 409 refetches and tells the user.
 */
export function useSaveJobReport(jobId: string) {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: JobReportInput) => saveJobReport(jobId, body, idempotency.keyFor(body)),
    onMutate: async (body, { client }) => {
      const before = client.getQueryData<JobReport>(reportKeys.job(jobId))
      if (before) putReport(client, { ...before, ...body })
      // Not reverting: a fetch that is on its way must not undo what was just put there
      await client.cancelQueries({ queryKey: reportKeys.job(jobId) }, { revert: false })
      return { before }
    },
    onSuccess: (report, body, _context, { client }) => {
      idempotency.forget(body)
      putReport(client, report)
    },
    onError: (error, _body, context, { client }) => {
      if (context?.before) putReport(client, context.before)
      return isConflict(error) ? handleReportConflict(client) : undefined
    },
  })
}

/**
 * Ticks and unticks checklist items. The tick shows at once and is taken back if the
 * request fails; changes to one job go one after the other so the last answer is the
 * last change.
 */
export function useUpdateChecklist(jobId: string) {
  return useMutation({
    scope: { id: `checklist-${jobId}` },
    mutationFn: (changes: UpdateJobChecklistBodyItem[]) => updateJobChecklist(jobId, changes),
    onMutate: async (changes, { client }) => {
      const before = client.getQueryData<JobReport>(reportKeys.job(jobId))
      if (before) {
        const isDone = new Map(changes.map((change) => [change.id, change.isDone]))
        putReport(client, {
          ...before,
          checklist: before.checklist.map((item) => ({
            ...item,
            isDone: isDone.get(item.id) ?? item.isDone,
          })),
        })
      }
      await client.cancelQueries({ queryKey: reportKeys.job(jobId) }, { revert: false })
      return { before }
    },
    onSuccess: (checklist, _changes, _before, { client }) => {
      const report = client.getQueryData<JobReport>(reportKeys.job(jobId))
      if (report) putReport(client, { ...report, checklist })
    },
    onError: (error, _changes, before, { client }) => {
      if (before?.before) putReport(client, before.before)
      return isConflict(error) ? handleReportConflict(client) : undefined
    },
  })
}

/** Adds a material; the report is fetched again for the line total and the sum. */
export function useAddJobMaterial(jobId: string) {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: (body: JobMaterialInput) => addJobMaterial(jobId, body, idempotency.keyFor(body)),
    onSuccess: (_material, body, _result, { client }) => {
      idempotency.forget(body)
      return client.invalidateQueries({ queryKey: reportKeys.job(jobId) })
    },
    onError: (error, _body, _result, { client }) =>
      isConflict(error) ? handleReportConflict(client) : undefined,
  })
}

export function useDeleteJobMaterial(jobId: string) {
  return useMutation({
    mutationFn: (materialId: string) => deleteJobMaterial(jobId, materialId),
    onSuccess: (_result, _materialId, _context, { client }) =>
      client.invalidateQueries({ queryKey: reportKeys.job(jobId) }),
    onError: (error, _id, _context, { client }) =>
      isConflict(error) ? handleReportConflict(client) : undefined,
  })
}

/**
 * Uploads a photo (or any file) for a job. Trying again with the same `file` resumes
 * the upload that failed.
 */
export function useUploadJobFile(jobId: string) {
  return useMutation({
    mutationFn: (request: Omit<UploadRequest, 'ownerType' | 'ownerId'>) =>
      uploadAttachment({ ...request, ownerType: 'job', ownerId: jobId }),
    onSuccess: (_attachment, _request, _context, { client }) =>
      client.invalidateQueries({ queryKey: reportKeys.job(jobId) }),
  })
}

/**
 * Uploads the company's logo; the caller links the returned file to the tenant. Trying
 * again with the same `file` resumes the upload that failed.
 */
export function useUploadTenantLogo(tenantId: string) {
  return useMutation({
    mutationFn: (file: Blob) =>
      uploadAttachment({
        ownerType: 'tenant',
        ownerId: tenantId,
        kind: 'logo',
        file,
        fileName: file instanceof File ? file.name : undefined,
      }),
  })
}

export function useDeleteAttachment(jobId: string) {
  return useMutation({
    mutationFn: (attachmentId: string) => deleteAttachment(attachmentId),
    onSuccess: (_result, _id, _context, { client }) =>
      client.invalidateQueries({ queryKey: reportKeys.job(jobId) }),
  })
}

/**
 * The client's signature: the drawn PNG is uploaded, then linked to the report with the
 * signer's name. Trying again with the same PNG continues from what has been done.
 */
export function useSignReport(jobId: string) {
  const idempotency = useIdempotencyKeys()
  return useMutation({
    mutationFn: async ({ png, signedByName }: { png: Blob; signedByName: string }) => {
      const attachment = await uploadAttachment({
        ownerType: 'job',
        ownerId: jobId,
        kind: 'signature',
        file: png,
        fileName: 'signature.png',
      })
      return attachSignature(
        jobId,
        { attachmentId: attachment.id, signedByName },
        idempotency.keyFor({ attachmentId: attachment.id, signedByName }),
      )
    },
    onSuccess: (report, _variables, _result, { client }) => {
      putReport(client, report)
    },
    onError: (error, _variables, _result, { client }) =>
      isConflict(error) ? handleReportConflict(client) : undefined,
  })
}

/** The printable HTML; the caller shows it (see `shared/lib/print-window`). */
export function usePrintJobReport() {
  return useMutation({ mutationFn: (jobId: string) => printJobReport(jobId) })
}
