import { http, HttpResponse, ws } from 'msw'

import { env } from '@/shared/config/env'

import { getDb } from '../db'
import { authenticate, type AuthContext } from './auth'
import { newToken } from './ids'
import type { HubMessage } from './realtime-events'

/**
 * The mock of the SignalR hub (`/hubs/dispatch`): the negotiate request, and a WebSocket
 * that speaks SignalR's JSON protocol, so the real client runs against it. Records in
 * the protocol end with 0x1e.
 */
const RECORD_END = '\x1e'
const PING_MS = 15_000

interface Connection {
  send: (record: object) => void
  close: (code?: number, reason?: string) => void
  tenantId: string
  role: AuthContext['role']
  technicianId: string | null
}

const connections = new Set<Connection>()

/** Who negotiated each connection id: a Node client sends its token as a header only. */
const negotiated = new Map<string, AuthContext>()

/** The user behind a token (negotiate: `Authorization`, the socket: `access_token`). */
function authFor(url: string, header: string | null): AuthContext | null {
  const token = new URL(url).searchParams.get('access_token')
  const bearer = header ?? (token ? `Bearer ${token}` : '')
  try {
    return authenticate(
      new Request('http://hub.invalid', { headers: { Authorization: bearer } }),
      getDb(),
    )
  } catch {
    return null
  }
}

/**
 * Sends hub messages to the tenant's connections: the office hears everything, a
 * technician what concerns them (the job's technicians, and every published plan).
 */
export function broadcast(tenantId: string, messages: HubMessage[]): void {
  for (const message of messages) {
    for (const connection of connections) {
      if (connection.tenantId !== tenantId) continue
      const concerns =
        connection.role !== 'technician' ||
        message.technicianIds === 'all' ||
        (connection.technicianId !== null &&
          message.technicianIds.includes(connection.technicianId))
      if (!concerns) continue
      connection.send({ type: 1, target: message.target, arguments: [message.payload] })
    }
  }
}

/** How many sockets are open (tests). */
export const openConnections = () => connections.size

/** Until when the hub refuses new connections (an outage). */
let outageUntil = 0

/**
 * Drops every connection, as a restart of the server would (tests, reseeding). With
 * `outageMs` the hub stays unreachable for that long: negotiating is a 503.
 */
export function dropConnections(outageMs = 0): void {
  outageUntil = outageMs > 0 ? Date.now() + outageMs : 0
  for (const connection of [...connections]) connection.close(1012, 'restart')
}

const hubSocket = ws.link(env.hubUrl.replace(/^http/, 'ws'))

export const realtimeHandlers = [
  http.post(`${env.hubUrl}/negotiate`, ({ request }) => {
    if (Date.now() < outageUntil) return new HttpResponse(null, { status: 503 })
    const auth = authFor(request.url, request.headers.get('Authorization'))
    if (!auth) return new HttpResponse(null, { status: 401 })
    const id = newToken('conn')
    negotiated.set(id, auth)
    return HttpResponse.json({
      negotiateVersion: 1,
      connectionId: id,
      connectionToken: id,
      availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
    })
  }),

  hubSocket.addEventListener('connection', ({ client }) => {
    const url = client.url.toString()
    // A browser puts the token in the address; the connection id says who negotiated it
    const id = new URL(url).searchParams.get('id') ?? ''
    const auth = authFor(url, null) ?? negotiated.get(id) ?? null
    negotiated.delete(id)
    if (!auth) {
      client.close(1008, 'Unauthorized')
      return
    }
    const send = (record: object) => {
      client.send(`${JSON.stringify(record)}${RECORD_END}`)
    }
    let ping: ReturnType<typeof setInterval> | undefined
    const connection: Connection = {
      send,
      close: (code, reason) => {
        // The server hanging up does not come back as a 'close' event
        clearInterval(ping)
        connections.delete(connection)
        client.close(code, reason)
      },
      tenantId: auth.tenantId,
      role: auth.role,
      technicianId: auth.technicianId,
    }
    client.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      for (const record of event.data.split(RECORD_END)) {
        if (record === '') continue
        const message = JSON.parse(record) as { protocol?: string; type?: number }
        if (message.protocol === 'json') {
          // The handshake is answered, then the connection belongs to the tenant's groups
          client.send(`{}${RECORD_END}`)
          connections.add(connection)
          ping = setInterval(() => {
            send({ type: 6 })
          }, PING_MS)
        }
      }
    })
    client.addEventListener('close', () => {
      clearInterval(ping)
      connections.delete(connection)
    })
  }),
]
