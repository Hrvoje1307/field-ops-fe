import type { ErrorObject } from 'ajv'
import { delay, http, HttpResponse, type HttpHandler } from 'msw'

import type { Role } from '@/shared/api/generated/model'
import { env } from '@/shared/config/env'
import { toIsoInstant } from '@/shared/lib/datetime'

import { getDb, saveDb } from '../db'
import type { MockDb, TenantData } from '../db/rows'
import { authenticate, type AuthContext } from './auth'
import { withIdempotency } from './idempotency'
import { broadcast } from './realtime'
import { eventsBetween, snapshotOf, type TenantSnapshot } from './realtime-events'
import {
  derefSchema,
  operationParameters,
  requestBodySchema,
  validatorFor,
  type HttpMethod,
} from './openapi'
import {
  FieldErrors,
  forbidden,
  MESSAGES,
  MockHttpError,
  type MockResult,
  notFound,
} from './problems'

/** Path parameters used by the spec's templates (always present when the route matched). */
type PathParams = Readonly<Record<'id' | 'userId' | 'token', string>>

export interface PublicContext<TBody = unknown, TQuery = Record<string, never>> {
  request: Request
  url: URL
  params: PathParams
  query: TQuery
  body: TBody
  db: MockDb
}

export interface RouteContext<
  TBody = unknown,
  TQuery = Record<string, never>,
> extends PublicContext<TBody, TQuery> {
  auth: AuthContext
}

type Handler<TContext> = (ctx: TContext) => MockResult | Promise<MockResult>

interface RouteOptions {
  /** Roles allowed to call the endpoint (default: every signed-in role). */
  roles?: readonly Role[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Small random latency in the browser; none in tests. */
async function latency(): Promise<void> {
  if (import.meta.env.MODE === 'test') return
  await delay(100 + Math.random() * 200)
}

// --- validation errors → field paths -------------------------------------------

/** `/contacts/0/phone` → `contacts[0].phone` */
function pointerToPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce(
      (path, segment) =>
        /^\d+$/.test(segment) ? `${path}[${segment}]` : path ? `${path}.${segment}` : segment,
      '',
    )
}

const join = (base: string, key: string) => (base && key ? `${base}.${key}` : base || key)

function messageFor(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>
  const limit = typeof params.limit === 'number' ? params.limit : 0
  switch (error.keyword) {
    case 'required':
      return MESSAGES.required
    case 'minLength':
      return limit <= 1 ? MESSAGES.required : MESSAGES.minLength(limit)
    case 'maxLength':
      return MESSAGES.maxLength(limit)
    case 'minimum':
    case 'exclusiveMinimum':
      return MESSAGES.minimum(limit)
    case 'maximum':
    case 'exclusiveMaximum':
      return MESSAGES.maximum(limit)
    case 'minItems':
      return MESSAGES.minItems
    case 'uniqueItems':
      return MESSAGES.duplicateItems
    case 'enum':
    case 'const':
      return MESSAGES.notAllowed
    case 'pattern':
      return MESSAGES.invalidFormat
    case 'additionalProperties':
      return MESSAGES.unknownField
    case 'format':
      return params.format === 'email'
        ? MESSAGES.invalidEmail
        : params.format === 'date' || params.format === 'date-time'
          ? MESSAGES.invalidDate
          : MESSAGES.invalidFormat
    default:
      return MESSAGES.invalid
  }
}

/** Ajv errors → `field path → messages`, skipping combinator noise (oneOf/anyOf, the `null` branch). */
export function collectSchemaErrors(
  errors: ErrorObject[] | null | undefined,
  into: FieldErrors,
  prefix = '',
): void {
  for (const error of errors ?? []) {
    if (['oneOf', 'anyOf', 'allOf', 'if', 'then', 'else', 'not'].includes(error.keyword)) continue
    const params = error.params as Record<string, unknown>
    if (error.keyword === 'type' && params.type === 'null') continue
    let path = join(prefix, pointerToPath(error.instancePath))
    if (error.keyword === 'required') path = join(path, String(params.missingProperty))
    if (error.keyword === 'additionalProperties')
      path = join(path, String(params.additionalProperty))
    into.add(path || 'body', messageFor(error))
  }
}

// --- request parsing -----------------------------------------------------------

function coerce(raw: string, type: unknown): unknown {
  if (type === 'integer' || type === 'number') return raw.trim() === '' ? raw : Number(raw)
  if (type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : raw
  return raw
}

/** Query parameters declared on the operation, coerced from strings and validated by their schemas. */
function parseQuery(
  method: HttpMethod,
  template: string,
  url: URL,
  errors: FieldErrors,
): Record<string, unknown> {
  const query: Record<string, unknown> = {}
  for (const parameter of operationParameters(method, template)) {
    if (parameter.in !== 'query' || !parameter.schema) continue
    const schema = derefSchema(parameter.schema)
    const raw = url.searchParams.getAll(parameter.name)
    if (raw.length === 0) {
      if (parameter.required) errors.add(parameter.name, MESSAGES.required)
      else if (schema?.default !== undefined) query[parameter.name] = schema.default
      continue
    }
    const value =
      schema?.type === 'array'
        ? raw
            .flatMap((v) => v.split(','))
            .map((v) => coerce(v, derefSchema(schema.items as Record<string, unknown>)?.type))
        : coerce(raw[0] ?? '', schema?.type)
    const validate = validatorFor(parameter.schema)
    if (validate(value)) query[parameter.name] = value
    else collectSchemaErrors(validate.errors, errors, parameter.name)
  }
  return query
}

function parseBody(
  method: HttpMethod,
  template: string,
  rawBody: string,
  errors: FieldErrors,
): unknown {
  const declared = requestBodySchema(method, template)
  if (!declared) return undefined
  if (rawBody.trim() === '') {
    if (declared.required) errors.add('body', MESSAGES.required)
    return undefined
  }
  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    errors.add('body', MESSAGES.invalidFormat)
    return undefined
  }
  const validate = validatorFor(declared.schema)
  if (!validate(body)) collectSchemaErrors(validate.errors, errors)
  return body
}

function toResponse(result: MockResult): Response {
  if (result.text) {
    return new HttpResponse(result.text.content, {
      status: result.status,
      headers: { 'Content-Type': result.text.contentType, ...result.headers },
    })
  }
  if (result.body === undefined)
    return new HttpResponse(null, { status: result.status, headers: result.headers })
  return new HttpResponse(JSON.stringify(result.body), {
    status: result.status,
    headers: {
      'Content-Type': result.status >= 400 ? 'application/problem+json' : 'application/json',
      ...result.headers,
    },
  })
}

// --- route definitions -----------------------------------------------------------

function define(
  method: HttpMethod,
  template: string,
  handler: Handler<RouteContext<unknown, unknown>> | Handler<PublicContext<unknown, unknown>>,
  options: RouteOptions & { isPublic: boolean },
): HttpHandler {
  const mswPath = `${env.apiUrl}${template.replace(/\{(\w+)\}/g, ':$1')}`

  return http[method](mswPath, async ({ request, params }) => {
    await latency()
    const db = getDb()
    const url = new URL(request.url)
    const pathParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    const rawBody = method === 'get' ? '' : await request.text()

    /** Validation + handler; errors become results so idempotency can store them. */
    const execute = async (auth: AuthContext | null): Promise<MockResult> => {
      try {
        const errors = new FieldErrors()
        const query = parseQuery(method, template, url, errors)
        const body = parseBody(method, template, rawBody, errors)
        errors.throwIfAny()
        const ctx = { request, url, params: pathParams as PathParams, query, body, db }
        return await (auth
          ? (handler as Handler<RouteContext<unknown, unknown>>)({ ...ctx, auth })
          : (handler as Handler<PublicContext<unknown, unknown>>)(ctx))
      } catch (error) {
        if (error instanceof MockHttpError) return error.result
        throw error
      }
    }

    let result: MockResult
    // What a write changed is told to the tenant's open connections, like the real hub does
    let watched: { tenantId: string; t: TenantData; before: TenantSnapshot } | null = null
    try {
      // Ids that aren't UUIDs can't exist
      for (const parameter of operationParameters(method, template)) {
        const schema = derefSchema(parameter.schema)
        if (
          parameter.in === 'path' &&
          schema?.format === 'uuid' &&
          !UUID.test(pathParams[parameter.name] ?? '')
        ) {
          throw notFound()
        }
      }
      if (options.isPublic) {
        result = await execute(null)
      } else {
        const auth = authenticate(request, db)
        if (options.roles && !options.roles.includes(auth.role)) throw forbidden()
        if (method !== 'get') {
          watched = { tenantId: auth.tenantId, t: auth.t, before: snapshotOf(auth.t) }
        }
        const key = method === 'get' ? null : request.headers.get('Idempotency-Key')
        result = key
          ? await withIdempotency(
              db,
              auth,
              key,
              `${method.toUpperCase()} ${url.pathname}${url.search}\n${rawBody}`,
              () => execute(auth),
            )
          : await execute(auth)
      }
    } catch (error) {
      if (!(error instanceof MockHttpError)) throw error
      result = error.result
    }

    if (method !== 'get') saveDb()
    if (watched) {
      broadcast(
        watched.tenantId,
        eventsBetween(watched.before, snapshotOf(watched.t), toIsoInstant(Date.now())),
      )
    }
    return toResponse(result)
  })
}

/** Endpoint that requires a signed-in user. Tenant and role come from the token. */
export function route<TBody = unknown, TQuery = Record<string, never>>(
  method: HttpMethod,
  template: string,
  handler: Handler<RouteContext<TBody, TQuery>>,
  options: RouteOptions = {},
): HttpHandler {
  return define(method, template, handler as Handler<RouteContext<unknown, unknown>>, {
    ...options,
    isPublic: false,
  })
}

/** Endpoint without authentication (login, refresh, password reset…). */
export function publicRoute<TBody = unknown, TQuery = Record<string, never>>(
  method: HttpMethod,
  template: string,
  handler: Handler<PublicContext<TBody, TQuery>>,
): HttpHandler {
  return define(method, template, handler as Handler<PublicContext<unknown, unknown>>, {
    isPublic: true,
  })
}
