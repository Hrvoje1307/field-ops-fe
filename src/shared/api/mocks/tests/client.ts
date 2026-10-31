/**
 * Test client for the mock API (msw/node intercepts fetch). Every response is
 * checked against the OpenAPI contract, so a mock that drifts fails the test.
 */
import { expect } from 'vitest'

import type { TokenResponse } from '@/shared/api/generated/model'

import { getDb } from '../db'
import type { TenantData } from '../db/rows'
import { matchPathTemplate, type HttpMethod } from '../lib/openapi'
import { contractViolations } from './contract'

export const API_URL = 'http://localhost/api/v1'

/** `METHOD /template` of every call made through `api()` in the current test file. */
export const calledOperations = new Set<string>()
export const PASSWORD = 'demo'

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
}

interface RequestOptions {
  token?: string
  body?: unknown
  headers?: Record<string, string>
  /** `manual` keeps a 302 as it is (the OAuth callback redirects the browser, not the app). */
  redirect?: RequestRedirect
}

export async function api<T = unknown>(
  method: HttpMethod,
  path: string,
  { token, body, headers, redirect }: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    method: method.toUpperCase(),
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  })
  const text = await response.text()
  const isJson = (response.headers.get('content-type') ?? '').includes('json')
  const parsed: unknown = text ? (isJson ? JSON.parse(text) : text) : undefined
  calledOperations.add(
    `${method.toUpperCase()} ${matchPathTemplate(new URL(path, API_URL).pathname) ?? path}`,
  )

  const violations = contractViolations(
    method,
    path,
    response.status,
    response.headers.get('content-type'),
    parsed,
  )
  expect(
    violations,
    `Response doesn't match the OpenAPI contract:\n${violations.join('\n')}`,
  ).toEqual([])

  return { status: response.status, body: parsed as T, headers: response.headers }
}

export interface Session {
  tokens: TokenResponse
  get: <T = unknown>(
    path: string,
    options?: Omit<RequestOptions, 'token'>,
  ) => Promise<ApiResponse<T>>
  post: <T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'token' | 'body'>,
  ) => Promise<ApiResponse<T>>
  put: <T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'token' | 'body'>,
  ) => Promise<ApiResponse<T>>
  del: <T = unknown>(
    path: string,
    options?: Omit<RequestOptions, 'token'>,
  ) => Promise<ApiResponse<T>>
}

export function sessionFor(tokens: TokenResponse): Session {
  const token = tokens.accessToken
  return {
    tokens,
    get: (path, options) => api('get', path, { ...options, token }),
    post: (path, body, options) => api('post', path, { ...options, body, token }),
    put: (path, body, options) => api('put', path, { ...options, body, token }),
    del: (path, options) => api('delete', path, { ...options, token }),
  }
}

/** Signs in with the seed password (optionally into a given tenant). */
export async function loginAs(email: string, tenantSlug?: string): Promise<Session> {
  const tenantId = tenantSlug ? tenantBySlug(tenantSlug).tenant.id : undefined
  const response = await api<TokenResponse>('post', '/auth/login', {
    body: { email, password: PASSWORD, ...(tenantId ? { tenantId } : {}) },
  })
  expect(response.status, `login ${email}`).toBe(200)
  return sessionFor(response.body)
}

// --- seed lookups (ids change per day, names don't) ---------------------------

export function tenantBySlug(slug: string): TenantData {
  const t = Object.values(getDb().tenants).find((data) => data.tenant.slug === slug)
  if (!t) throw new Error(`No tenant ${slug}`)
  return t
}

export function clientId(slug: string, name: string): string {
  const client = tenantBySlug(slug).clients.find((c) => c.name === name)
  if (!client) throw new Error(`No client ${name}`)
  return client.id
}

export function jobId(slug: string, title: string, clientName?: string): string {
  const t = tenantBySlug(slug)
  const job = t.jobs.find(
    (j) =>
      j.title === title &&
      (!clientName || t.clients.find((c) => c.id === j.clientId)?.name === clientName),
  )
  if (!job) throw new Error(`No job ${title}`)
  return job.id
}

export function technicianId(slug: string, email: string): string {
  const db = getDb()
  const user = db.users.find((u) => u.email === email)
  const technician = tenantBySlug(slug).technicians.find((t) => t.userId === user?.id)
  if (!technician) throw new Error(`No technician ${email}`)
  return technician.id
}

export const USERS = {
  alarmkoOwner: 'vlasnik@alarmko.test',
  alarmkoDispatcher: 'dispecer@alarmko.test',
  ivan: 'ivan@alarmko.test',
  luka: 'luka@alarmko.test',
  petra: 'petra@alarmko.test',
  buraOwner: 'vlasnik@bura.test',
  buraDispatcher: 'dispecer@bura.test',
  ante: 'ante@bura.test',
  mia: 'mia@bura.test',
  ana: 'ana@demo.test',
} as const
