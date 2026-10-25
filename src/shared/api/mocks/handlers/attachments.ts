import { http, HttpResponse } from 'msw'

import type {
  AttachmentKind,
  ConfirmAttachmentBody,
  CreateUploadUrlBody,
  ListAttachmentsParams,
} from '@/shared/api/generated/model'
import { env } from '@/shared/config/env'
import { toIsoInstant } from '@/shared/lib/datetime'

import { getDb, saveDb } from '../db'
import type { AttachmentRow, TenantData } from '../db/rows'
import { ALL_ROLES, findRow, getVisibleJob, viewerOf } from '../lib/access'
import { newId } from '../lib/ids'
import {
  FieldErrors,
  MESSAGES,
  noContent,
  notFound,
  ok,
  created,
  unprocessable,
} from '../lib/problems'
import { isAvailable, presentAttachment } from '../lib/present'
import { route } from '../lib/route'
import type { AuthContext } from '../lib/auth'

/** Where the mock's "object storage" lives; the real API returns a presigned S3 URL. */
const STORAGE_PATH = '/mock-storage'
const UPLOAD_VALID_MS = 15 * 60_000
/** Small files are kept (a signature to draw again); photos are not worth localStorage. */
const PREVIEW_LIMIT_BYTES = 100_000

const KIND_MIMES: Record<AttachmentKind, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  signature: ['image/png'],
  pdf: ['application/pdf'],
  doc: ['application/pdf', 'image/jpeg', 'image/png'],
  logo: ['image/jpeg', 'image/png', 'image/webp'],
}

function ownerExists(
  t: TenantData,
  auth: AuthContext,
  ownerType: string,
  ownerId: string,
): boolean {
  switch (ownerType) {
    case 'tenant':
      return ownerId === t.tenant.id
    case 'client':
      return Boolean(findRow(t.clients, ownerId))
    case 'location':
      return Boolean(findRow(t.locations, ownerId))
    case 'asset':
      return Boolean(findRow(t.assets, ownerId))
    case 'job':
      try {
        getVisibleJob(t, viewerOf(auth), ownerId)
        return true
      } catch {
        return false
      }
    default:
      return false
  }
}

function findAttachment(t: TenantData, id: string): AttachmentRow {
  const row = t.attachments.find((a) => a.id === id && !a.deletedAt)
  if (!row) throw notFound()
  return row
}

/** A gray placeholder standing in for a photo's bytes. */
function placeholder(row: AttachmentRow): string {
  const label = (row.fileName ?? row.kind).replace(/[<>&"]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#d4d4d8"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#52525b">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export const attachmentHandlers = [
  route<CreateUploadUrlBody>(
    'post',
    '/attachments/upload-url',
    ({ auth, body }) => {
      const t = auth.t
      const errors = new FieldErrors()
      if (!ownerExists(t, auth, body.ownerType, body.ownerId)) {
        errors.add('ownerId', MESSAGES.notFound)
      }
      if (!KIND_MIMES[body.kind].includes(body.mime)) errors.add('mime', MESSAGES.notAllowed)
      errors.throwIfAny()
      const now = Date.now()
      const row: AttachmentRow = {
        id: newId(),
        ownerType: body.ownerType,
        ownerId: body.ownerId,
        kind: body.kind,
        fileName: body.fileName ?? null,
        mime: body.mime,
        sizeBytes: body.sizeBytes,
        takenAt: null,
        createdAt: toIsoInstant(now),
        deletedAt: null,
        state: 'pending',
        availableAt: null,
        preview: null,
      }
      t.attachments.push(row)
      return created({
        attachmentId: row.id,
        uploadUrl: `${env.apiUrl}${STORAGE_PATH}/${row.id}`,
        method: 'PUT',
        headers: { 'Content-Type': row.mime },
        expiresAt: toIsoInstant(now + UPLOAD_VALID_MS),
      })
    },
    { roles: ALL_ROLES },
  ),

  route<ConfirmAttachmentBody>(
    'post',
    '/attachments',
    ({ auth, body }) => {
      const t = auth.t
      const row = t.attachments.find((a) => a.id === body.attachmentId && !a.deletedAt)
      if (!row) throw unprocessable('attachment.not_found', 'Datoteka ne postoji.')
      if (row.state === 'pending') {
        throw unprocessable('attachment.not_uploaded', 'Datoteka još nije prenesena.')
      }
      row.state = 'confirmed'
      if (body.takenAt) row.takenAt = body.takenAt
      return ok(presentAttachment(row))
    },
    { roles: ALL_ROLES },
  ),

  route<undefined, ListAttachmentsParams>(
    'get',
    '/attachments',
    ({ auth, query }) => {
      const t = auth.t
      if (!ownerExists(t, auth, query.ownerType, query.ownerId)) throw notFound()
      return ok(
        t.attachments
          .filter((a) => a.ownerType === query.ownerType && a.ownerId === query.ownerId)
          .filter((a) => isAvailable(a))
          .map(presentAttachment),
      )
    },
    { roles: ALL_ROLES },
  ),

  route(
    'get',
    '/attachments/{id}/url',
    ({ auth, params }) => {
      const row = findAttachment(auth.t, params.id)
      if (!isAvailable(row) || !ownerExists(auth.t, auth, row.ownerType, row.ownerId)) {
        throw notFound()
      }
      const url = row.preview ?? placeholder(row)
      return ok({ url, thumbnailUrl: url, expiresAt: toIsoInstant(Date.now() + 5 * 60_000) })
    },
    { roles: ALL_ROLES },
  ),

  route(
    'delete',
    '/attachments/{id}',
    ({ auth, params }) => {
      const row = findAttachment(auth.t, params.id)
      if (!ownerExists(auth.t, auth, row.ownerType, row.ownerId)) throw notFound()
      row.deletedAt = toIsoInstant(Date.now())
      return noContent()
    },
    { roles: ALL_ROLES },
  ),

  // The "storage" the upload URL points at (the real one is S3, outside the API). It is
  // not part of the contract; it exists so the whole upload flow runs against the mock.
  http.put(`${env.apiUrl}${STORAGE_PATH}/:id`, async ({ request, params }) => {
    const db = getDb()
    const id = String(params.id)
    const row = Object.values(db.tenants)
      .flatMap((t) => t.attachments)
      .find((a) => a.id === id && !a.deletedAt)
    if (!row) return new HttpResponse(null, { status: 404 })
    // A presigned URL only works with exactly the headers it was signed for
    if (request.headers.get('Content-Type') !== row.mime) {
      return new HttpResponse(null, { status: 403 })
    }
    const bytes = new Uint8Array(await request.arrayBuffer())
    if (bytes.byteLength !== row.sizeBytes) return new HttpResponse(null, { status: 400 })
    row.state = 'uploaded'
    if (row.kind === 'signature' && bytes.byteLength <= PREVIEW_LIMIT_BYTES) {
      row.preview = `data:${row.mime};base64,${toBase64(bytes)}`
    }
    saveDb()
    return new HttpResponse(null, { status: 200 })
  }),
]
