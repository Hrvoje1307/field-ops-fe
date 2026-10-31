import type {
  DeleteMailboxParams,
  ImapMailboxCreate,
  MailboxOAuthStartRequest,
  MailboxUpdate,
} from '@/shared/api/generated/model'
import { addDays, todayInTimeZone, toIsoInstant } from '@/shared/lib/datetime'

import { saveDb } from '../db'
import type { MockDb } from '../db/rows'
import type { MailboxRow } from '../db/sales-rows'
import { newId, newToken } from '../lib/ids'
import {
  conflict,
  created,
  FieldErrors,
  MESSAGES,
  noContent,
  notFound,
  ok,
  unprocessable,
  MockHttpError,
} from '../lib/problems'
import { publicRoute, route } from '../lib/route'
import { canSeeMailbox } from '../lib/sales/access'
import { MOCK_CONNECT_MS, OAUTH_STATE_TTL_MS } from '../lib/sales/const'
import { openSales } from '../lib/sales/context'
import { connectedMailboxes, presentMailbox } from '../lib/sales/present'
import type { AuthContext } from '../lib/auth'

/** Where the browser returns after the provider's consent (spec: `{APP_URL}/sales/settings/mailboxes`). */
const appUrl = () => ('location' in globalThis ? globalThis.location.origin : 'http://localhost')
const MAILBOXES_PAGE = '/sales/settings/mailboxes'

function mailboxOf(auth: AuthContext, id: string): MailboxRow {
  const { sales } = openSales(auth)
  const row = sales.mailboxes.find((m) => m.id === id && !m.deletedAt)
  if (!row || !canSeeMailbox(auth, row)) throw notFound()
  return row
}

/** A personal mailbox belongs to a user of the tenant; the caller by default. */
function ownerFor(
  db: MockDb,
  auth: AuthContext,
  kind: 'shared' | 'personal',
  ownerUserId: string | null | undefined,
  errors: FieldErrors,
): string | null {
  if (kind === 'shared') return null
  const owner = ownerUserId ?? auth.user.id
  const member = db.memberships.some(
    (m) => m.tenantId === auth.tenantId && m.userId === owner && m.isActive,
  )
  if (!member) errors.add('ownerUserId', MESSAGES.notFound)
  return owner
}

/**
 * The server tests IMAP and SMTP before saving. The mock has no servers: a host ending in
 * `.invalid` does not answer, and the password `wrong` is refused (mock-only conventions).
 */
function testConnections(body: ImapMailboxCreate): void {
  if (body.imapHost.toLowerCase().endsWith('.invalid')) {
    throw unprocessable(
      'mailbox.imap_failed',
      `Could not connect to ${body.imapHost}:${String(body.imapPort)}.`,
    )
  }
  if (body.password === 'wrong') {
    throw unprocessable('mailbox.imap_failed', 'Authentication failed.')
  }
  if (body.smtpHost.toLowerCase().endsWith('.invalid')) {
    throw unprocessable(
      'mailbox.smtp_failed',
      `Could not connect to ${body.smtpHost}:${String(body.smtpPort)}.`,
    )
  }
}

function redirect(location: string): never {
  throw new MockHttpError({ status: 302, headers: { Location: location } })
}

export const salesMailboxHandlers = [
  route('get', '/sales/mailboxes', ({ db, auth }) => {
    const { sales } = openSales(auth)
    return ok(connectedMailboxes(auth, sales).map((m) => presentMailbox(db, m)))
  }),

  route<MailboxOAuthStartRequest>('post', '/sales/mailboxes/oauth/start', ({ db, auth, body }) => {
    const { sales, t } = openSales(auth, { ownerOnly: true })
    const errors = new FieldErrors()
    const ownerUserId = ownerFor(db, auth, body.kind, body.ownerUserId, errors)
    if (body.mailboxId) {
      const existing = sales.mailboxes.find((m) => m.id === body.mailboxId && !m.deletedAt)
      if (!existing) errors.add('mailboxId', MESSAGES.notFound)
      else if (existing.provider !== body.provider) errors.add('provider', MESSAGES.notAllowed)
    }
    errors.throwIfAny()
    const now = Date.now()
    const state = newToken('oauth')
    sales.oauthStates.push({
      state,
      userId: auth.user.id,
      provider: body.provider,
      kind: body.kind,
      ownerUserId,
      syncFrom: body.syncFrom ?? addDays(todayInTimeZone(t.tenant.timezone), -90),
      mailboxId: body.mailboxId ?? null,
      expiresAt: toIsoInstant(now + OAUTH_STATE_TTL_MS),
      usedAt: null,
    })
    // The provider's consent page is outside the API; the mock sends the browser to its own
    // stand-in, which finishes with the callback below.
    return ok({
      authorizeUrl: `${appUrl()}/mock-oauth/${body.provider}?state=${encodeURIComponent(state)}`,
    })
  }),

  // The provider redirects the browser here (302 to the mailboxes page). The frontend never calls it.
  publicRoute<undefined, { code?: string; state: string; error?: string }>(
    'get',
    '/sales/mailboxes/oauth/callback',
    ({ db, query }) => {
      const back = (result: string) => {
        // A GET is not stored by the route wrapper, and the browser leaves the page right after
        saveDb()
        return redirect(`${appUrl()}${MAILBOXES_PAGE}?${result}`)
      }
      const found = Object.values(db.tenants)
        .flatMap((t) => t.sales.oauthStates.map((s) => ({ t, s })))
        .find(({ s }) => s.state === query.state)
      if (!found || found.s.usedAt || Date.parse(found.s.expiresAt) < Date.now()) {
        return back('error=provider_error')
      }
      const { t, s } = found
      s.usedAt = toIsoInstant(Date.now())
      if (query.error) {
        return back(`error=${query.error === 'access_denied' ? 'access_denied' : 'provider_error'}`)
      }
      // The consent page names the account it signed in with in `code` (`mock:<address>`)
      const address = (query.code?.startsWith('mock:') ? query.code.slice(5) : '').toLowerCase()
      if (!address) return back('error=provider_error')
      const now = toIsoInstant(Date.now())
      const same = t.sales.mailboxes.find((m) => !m.deletedAt && m.emailAddress === address)
      if (s.mailboxId) {
        const target = t.sales.mailboxes.find((m) => m.id === s.mailboxId)
        if (target?.emailAddress !== address) return back('error=wrong_account')
        target.status = 'active'
        target.lastError = null
        target.canSend = true
        target.updatedAt = now
        return back(`connected=${target.id}`)
      }
      if (same) return back('error=already_connected')
      const row: MailboxRow = {
        id: newId(),
        provider: s.provider,
        emailAddress: address,
        displayName: address,
        kind: s.kind,
        ownerUserId: s.ownerUserId,
        status: 'connecting',
        connectingUntil: toIsoInstant(Date.now() + MOCK_CONNECT_MS),
        lastSyncedAt: null,
        lastError: null,
        syncFrom: s.syncFrom,
        canSend: true,
        imap: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      t.sales.mailboxes.push(row)
      return back(`connected=${row.id}`)
    },
  ),

  route<ImapMailboxCreate>('post', '/sales/mailboxes/imap', ({ db, auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const errors = new FieldErrors()
    const ownerUserId = ownerFor(db, auth, body.kind, body.ownerUserId, errors)
    errors.throwIfAny()
    const address = body.emailAddress.toLowerCase()
    if (sales.mailboxes.some((m) => !m.deletedAt && m.emailAddress === address)) {
      throw conflict('sales.mailbox_exists', 'This address is already connected.')
    }
    testConnections(body)
    const now = toIsoInstant(Date.now())
    const row: MailboxRow = {
      id: newId(),
      provider: 'imap',
      emailAddress: address,
      displayName: (body.displayName ?? '').trim() || address,
      kind: body.kind,
      ownerUserId,
      status: 'connecting',
      connectingUntil: toIsoInstant(Date.now() + MOCK_CONNECT_MS),
      lastSyncedAt: null,
      lastError: null,
      syncFrom: body.syncFrom ?? addDays(todayInTimeZone(auth.t.tenant.timezone), -90),
      canSend: true,
      imap: {
        host: body.imapHost,
        port: body.imapPort,
        security: body.imapSecurity,
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpSecurity: body.smtpSecurity,
        username: body.username,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    sales.mailboxes.push(row)
    return created(presentMailbox(db, row))
  }),

  route<MailboxUpdate>('put', '/sales/mailboxes/{id}', ({ db, auth, body, params }) => {
    openSales(auth, { ownerOnly: true })
    const row = mailboxOf(auth, params.id)
    const errors = new FieldErrors()
    const ownerUserId = ownerFor(
      db,
      auth,
      body.kind,
      body.ownerUserId ?? (body.kind === 'personal' ? row.ownerUserId : null),
      errors,
    )
    errors.throwIfAny()
    row.displayName = body.displayName.trim()
    row.kind = body.kind
    row.ownerUserId = ownerUserId
    // `isActive: false` pauses syncing (status disabled)
    if (!body.isActive) row.status = 'disabled'
    else if (row.status === 'disabled') row.status = 'active'
    row.updatedAt = toIsoInstant(Date.now())
    return ok(presentMailbox(db, row))
  }),

  route<undefined, DeleteMailboxParams>(
    'delete',
    '/sales/mailboxes/{id}',
    ({ auth, params, query }) => {
      const { sales } = openSales(auth, { ownerOnly: true })
      const row = mailboxOf(auth, params.id)
      const now = toIsoInstant(Date.now())
      row.deletedAt = now
      row.status = 'disabled'
      if (query.purge) {
        // The mailbox's own conversations go with it; one also held elsewhere stays there
        for (const message of sales.messages) {
          message.mailboxIds = message.mailboxIds.filter((id) => id !== row.id)
        }
        sales.messages = sales.messages.filter((m) => m.mailboxIds.length > 0)
        for (const thread of sales.threads) {
          if (!thread.mailboxIds.includes(row.id)) continue
          thread.mailboxIds = thread.mailboxIds.filter((id) => id !== row.id)
          if (thread.mailboxIds.length === 0) thread.deletedAt = now
          else if (thread.shownMailboxId === row.id)
            thread.shownMailboxId = thread.mailboxIds[0] ?? thread.shownMailboxId
        }
        for (const draft of sales.drafts) {
          if (draft.mailboxId === row.id) draft.deletedAt = now
        }
      }
      return noContent()
    },
  ),

  route('post', '/sales/mailboxes/{id}/sync', ({ auth, params }) => {
    const row = mailboxOf(auth, params.id)
    if (row.status === 'needs_reauth') {
      throw conflict('sales.mailbox_needs_reauth', 'The mailbox has to be connected again.')
    }
    row.lastSyncedAt = toIsoInstant(Date.now())
    return { status: 202 }
  }),
]
