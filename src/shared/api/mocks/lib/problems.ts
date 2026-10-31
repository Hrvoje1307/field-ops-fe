import type { ProblemDetails, ValidationProblemDetails } from '@/shared/api/generated/model'

import { newId } from './ids'

/** What a handler returns; turned into an HTTP response by the route wrapper. */
export interface MockResult {
  status: number
  body?: unknown
  /** A plain-text or HTML body (instead of JSON), with its media type. */
  text?: { content: string; contentType: string }
  headers?: Record<string, string>
}

export const ok = (body: unknown): MockResult => ({ status: 200, body })
export const created = (body: unknown): MockResult => ({ status: 201, body })
export const html = (content: string): MockResult => ({
  status: 200,
  text: { content, contentType: 'text/html; charset=utf-8' },
})
export const noContent = (): MockResult => ({ status: 204 })
export const accepted = (): MockResult => ({ status: 202 })

/** Thrown anywhere in a handler; the wrapper answers with its result. */
export class MockHttpError extends Error {
  readonly result: MockResult

  constructor(result: MockResult) {
    super(`Mock API error ${String(result.status)}`)
    this.name = 'MockHttpError'
    this.result = result
  }
}

function problem(
  status: number,
  title: string,
  code: string,
  detail?: string,
  headers?: Record<string, string>,
): MockHttpError {
  const body: ProblemDetails = { type: 'about:blank', title, status, code, traceId: newId() }
  if (detail) body.detail = detail
  return new MockHttpError({ status, body, headers })
}

export const unauthorized = (code = 'auth.unauthorized', detail?: string) =>
  problem(401, 'Unauthorized', code, detail)
export const forbidden = (code = 'auth.forbidden', detail?: string) =>
  problem(403, 'Forbidden', code, detail)
export const paymentRequired = (code: string, detail?: string) =>
  problem(402, 'Payment required', code, detail)
export const badGateway = (code: string, detail?: string) =>
  problem(502, 'Bad gateway', code, detail)
export const gone = (code = 'link.gone', detail?: string) => problem(410, 'Gone', code, detail)
export const notFound = () => problem(404, 'Not found', 'not_found')
export const conflict = (code: string, detail?: string) => problem(409, 'Conflict', code, detail)
export const unprocessable = (code: string, detail?: string) =>
  problem(422, 'Unprocessable entity', code, detail)
export const tooManyRequests = (retryAfterSeconds: number) =>
  problem(429, 'Too many requests', 'auth.too_many_attempts', undefined, {
    'Retry-After': String(retryAfterSeconds),
  })

/** 429 with a `Retry-After` in seconds (rate limits, the monthly AI allowance). */
export const rateLimited = (code: string, retryAfterSeconds: number, detail?: string) =>
  problem(429, 'Too many requests', code, detail, { 'Retry-After': String(retryAfterSeconds) })

/**
 * A 400 that carries its own `code` next to the field errors (`sales.lost_reason_required`:
 * "validation, also in errors.lostReason").
 */
export function validationWithCode(code: string, errors: Record<string, string[]>): MockHttpError {
  const body: ValidationProblemDetails = {
    type: 'about:blank',
    title: 'Validation failed',
    status: 400,
    code,
    traceId: newId(),
    errors,
  }
  return new MockHttpError({ status: 400, body })
}

/** Validation messages as the API returns them (tenant locale: Croatian). */
export const MESSAGES = {
  required: 'Obavezno polje.',
  invalid: 'Neispravna vrijednost.',
  invalidFormat: 'Neispravan format.',
  invalidEmail: 'Neispravna e-mail adresa.',
  invalidDate: 'Neispravan datum.',
  invalidPhone: 'Neispravan broj telefona.',
  unknownField: 'Nepoznato polje.',
  notAllowed: 'Nedopuštena vrijednost.',
  duplicate: 'Već postoji.',
  notFound: 'Ne postoji.',
  duplicateItems: 'Stavke se ponavljaju.',
  minItems: 'Potrebna je barem jedna stavka.',
  minLength: (n: number) => `Najmanje ${String(n)} znakova.`,
  maxLength: (n: number) => `Najviše ${String(n)} znakova.`,
  minimum: (n: number) => `Najmanje ${String(n)}.`,
  maximum: (n: number) => `Najviše ${String(n)}.`,
} as const

/** Collects field errors (field path → messages) and throws one 400 at the end. */
export class FieldErrors {
  readonly errors: Record<string, string[]> = {}

  add(path: string, message: string): void {
    const messages = (this.errors[path] ??= [])
    if (!messages.includes(message)) messages.push(message)
  }

  get isEmpty(): boolean {
    return Object.keys(this.errors).length === 0
  }

  throwIfAny(): void {
    if (this.isEmpty) return
    const body: ValidationProblemDetails = {
      type: 'about:blank',
      title: 'Validation failed',
      status: 400,
      code: 'validation_failed',
      traceId: newId(),
      errors: this.errors,
    }
    throw new MockHttpError({ status: 400, body })
  }
}

/** Throws a 400 with a single field error. */
export function invalidField(path: string, message: string): never {
  const errors = new FieldErrors()
  errors.add(path, message)
  errors.throwIfAny()
  throw new Error('unreachable')
}
