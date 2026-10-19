/**
 * The OpenAPI contract as data, for the mock (request validation) and the
 * contract test (response validation). OpenAPI 3.1 schemas are JSON Schema
 * 2020-12, so ajv's 2020 dialect validates them as written.
 */
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

import specJson from '../../../../../openapi/openapi.json'

type JsonSchema = Record<string, unknown>

interface MediaType {
  schema?: JsonSchema
}

interface ResponseObject {
  description?: string
  content?: Record<string, MediaType>
  headers?: Record<string, unknown>
}

interface ParameterObject {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  schema?: JsonSchema
}

interface Ref {
  $ref: string
}

export interface OperationObject {
  operationId: string
  tags?: string[]
  security?: unknown[]
  parameters?: (ParameterObject | Ref)[]
  requestBody?: { required?: boolean; content: Record<string, MediaType> }
  responses: Record<string, ResponseObject | Ref>
}

type PathItem = Partial<Record<'get' | 'post' | 'put' | 'delete' | 'patch', OperationObject>> & {
  parameters?: (ParameterObject | Ref)[]
}

interface OpenApiDocument {
  paths: Record<string, PathItem>
  components: {
    schemas: Record<string, JsonSchema>
    responses: Record<string, ResponseObject>
    parameters: Record<string, ParameterObject>
  }
}

export const spec = specJson as unknown as OpenApiDocument

const SCHEMA_ID = 'fieldops'

export const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
ajv.addSchema({ $id: SCHEMA_ID, components: spec.components })

const isRef = (value: unknown): value is Ref =>
  typeof value === 'object' && value !== null && '$ref' in value

/** Resolves `#/components/...` references (one level is enough for this spec). */
function resolveRef<T>(value: T | Ref): T {
  if (!isRef(value)) return value
  const path = value.$ref.replace(/^#\//, '').split('/')
  let node: unknown = spec
  for (const segment of path) node = (node as Record<string, unknown>)[segment]
  return node as T
}

/** Follows `$ref`s on a schema node (for reading `type` while coercing query strings). */
export function derefSchema(schema: JsonSchema | undefined): JsonSchema | undefined {
  let node: unknown = schema
  while (isRef(node)) node = resolveRef<unknown>(node)
  return node as JsonSchema | undefined
}

const validators = new WeakMap<object, ValidateFunction>()

/** Compiles (once) a schema taken from anywhere in the spec. */
export function validatorFor(schema: JsonSchema): ValidateFunction {
  let validate = validators.get(schema)
  if (!validate) {
    // Inline schemas refer to `#/components/...` of the whole document; point them at our copy
    const rebased = JSON.parse(
      JSON.stringify(schema).replaceAll('"#/components/', `"${SCHEMA_ID}#/components/`),
    ) as JsonSchema
    validate = ajv.compile(rebased)
    validators.set(schema, validate)
  }
  return validate
}

export type HttpMethod = 'get' | 'post' | 'put' | 'delete'

const templateMatchers = Object.keys(spec.paths).map((template) => ({
  template,
  regex: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
  literalSegments: template.split('/').filter((s) => !s.startsWith('{')).length,
}))

/** The spec path template for a concrete path (`/jobs/abc` → `/jobs/{id}`), most specific first. */
export function matchPathTemplate(pathname: string): string | undefined {
  return templateMatchers
    .filter((m) => m.regex.test(pathname))
    .sort((a, b) => b.literalSegments - a.literalSegments)[0]?.template
}

export function getOperation(method: HttpMethod, template: string): OperationObject | undefined {
  return spec.paths[template]?.[method]
}

export function operationParameters(method: HttpMethod, template: string): ParameterObject[] {
  const pathItem = spec.paths[template]
  return [...(pathItem?.parameters ?? []), ...(pathItem?.[method]?.parameters ?? [])].map((p) =>
    resolveRef<ParameterObject>(p),
  )
}

export function requestBodySchema(
  method: HttpMethod,
  template: string,
): { schema: JsonSchema; required: boolean } | undefined {
  const body = getOperation(method, template)?.requestBody
  const schema = body?.content['application/json']?.schema
  return schema ? { schema, required: body.required ?? false } : undefined
}

/** The declared response for a status, with `$ref`s to `components/responses` resolved. */
export function declaredResponse(
  operation: OperationObject,
  status: number,
): ResponseObject | undefined {
  const response = operation.responses[String(status)] ?? operation.responses.default
  return response ? resolveRef<ResponseObject>(response) : undefined
}

export const componentSchema = (name: string): JsonSchema => {
  const schema = spec.components.schemas[name]
  if (!schema) throw new Error(`Unknown schema ${name}`)
  return schema
}
