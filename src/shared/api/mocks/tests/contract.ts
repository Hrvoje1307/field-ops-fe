/**
 * Checks a mock response against the OpenAPI contract: the status must be
 * declared (or be one of the documented global errors) and the body must
 * validate against its response schema.
 */
import { isKnownSalesErrorCode } from './sales-codes'
import {
  componentSchema,
  declaredResponse,
  getOperation,
  matchPathTemplate,
  operationParameters,
  requestBodySchema,
  validatorFor,
  type HttpMethod,
  type OperationObject,
} from '../lib/openapi'

/**
 * Errors the backend returns although most operations don't declare them
 * (docs/backend-questions.md #6): 401/403/404/422 on protected operations,
 * 400 where there is a body or query parameters, 409 where a `version` is sent.
 */
function globalErrorSchema(
  method: HttpMethod,
  template: string,
  operation: OperationObject,
  status: number,
) {
  const isProtected = operation.security === undefined || operation.security.length > 0
  const body = requestBodySchema(method, template)
  const hasQuery = operationParameters(method, template).some((p) => p.in === 'query')
  const sendsVersion =
    body !== undefined && JSON.stringify(resolveTop(body.schema)).includes('"version"')

  if (isProtected && [401, 403, 404, 422].includes(status)) return componentSchema('ProblemDetails')
  if (status === 400 && (body || hasQuery)) return componentSchema('ValidationProblemDetails')
  if (status === 409 && sendsVersion) return componentSchema('ProblemDetails')
  return undefined
}

function resolveTop(schema: Record<string, unknown>): Record<string, unknown> {
  const ref = schema.$ref
  return typeof ref === 'string' ? componentSchema(ref.split('/').pop() ?? '') : schema
}

export function contractViolations(
  method: HttpMethod,
  path: string,
  status: number,
  contentType: string | null,
  body: unknown,
): string[] {
  const pathname = new URL(path, 'http://localhost').pathname
  const template = matchPathTemplate(pathname)
  const operation = template && getOperation(method, template)
  if (!template || !operation) return [`${method.toUpperCase()} ${pathname} is not in the spec`]
  const label = `${method.toUpperCase()} ${template} → ${String(status)}`

  const declared = declaredResponse(operation, status)
  let expectedType: string | undefined
  let schema: Record<string, unknown> | undefined

  if (declared) {
    const [mediaType] = Object.entries(declared.content ?? {})
    if (!mediaType)
      return body === undefined ? [] : [`${label}: declared without a body but one was returned`]
    expectedType = mediaType[0]
    schema = mediaType[1].schema
  } else {
    schema = globalErrorSchema(method, template, operation, status)
    if (!schema) return [`${label} is not declared in the spec`]
    expectedType = 'application/problem+json'
  }

  const violations: string[] = []
  // The error codes of the Sales module are the tag's (or a documented gap), whatever test makes the call
  if (status >= 400 && template.startsWith('/sales/')) {
    const code = (body as { code?: unknown } | undefined)?.code
    if (typeof code !== 'string' || !isKnownSalesErrorCode(code)) {
      violations.push(`${label}: error code ${String(code)} is not one the spec's Sales tag names`)
    }
  }
  if (!contentType?.startsWith(expectedType)) {
    violations.push(`${label}: content type ${String(contentType)}, expected ${expectedType}`)
  }
  if (schema) {
    const validate = validatorFor(schema)
    if (!validate(body)) {
      for (const error of validate.errors ?? []) {
        violations.push(
          `${label}: ${error.instancePath || '(root)'} ${error.message ?? ''} ${JSON.stringify(error.params)}`,
        )
      }
    }
  }
  return violations
}
