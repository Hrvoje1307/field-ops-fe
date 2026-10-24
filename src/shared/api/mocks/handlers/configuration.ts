import type {
  CustomFieldDefinition,
  CustomFieldDefinitionInput,
  JobTypeInput,
  ListCustomFieldsParams,
} from '@/shared/api/generated/model'

import type { TenantData } from '../db/rows'
import { ALL_ROLES, OFFICE_ROLES } from '../lib/access'
import { newId } from '../lib/ids'
import {
  conflict,
  created,
  FieldErrors,
  MESSAGES,
  noContent,
  notFound,
  ok,
  unprocessable,
} from '../lib/problems'
import { route } from '../lib/route'

function validateJobType(t: TenantData, body: JobTypeInput): void {
  const errors = new FieldErrors()
  body.requiredSkillIds.forEach((id, index) => {
    if (!t.skills.some((s) => s.id === id))
      errors.add(`requiredSkillIds[${String(index)}]`, MESSAGES.notFound)
  })
  if (
    body.checklistTemplateId &&
    !t.checklistTemplates.some((c) => c.id === body.checklistTemplateId)
  ) {
    errors.add('checklistTemplateId', MESSAGES.notFound)
  }
  errors.throwIfAny()
}

/** Definition from input; collects 400 errors (asset type scope, options for select types). */
function customFieldFrom(
  t: TenantData,
  id: string,
  body: CustomFieldDefinitionInput,
): CustomFieldDefinition {
  const errors = new FieldErrors()
  const assetTypeId = body.assetTypeId ?? null
  if (assetTypeId && body.entity !== 'asset') errors.add('assetTypeId', MESSAGES.notAllowed)
  else if (assetTypeId && !t.assetTypes.some((a) => a.id === assetTypeId))
    errors.add('assetTypeId', MESSAGES.notFound)
  const needsOptions = body.type === 'select' || body.type === 'multiselect'
  if (needsOptions && !body.options?.length) errors.add('options', MESSAGES.required)
  errors.throwIfAny()
  return {
    id,
    entity: body.entity,
    assetTypeId,
    key: body.key,
    label: body.label,
    type: body.type,
    options: needsOptions ? (body.options ?? null) : null,
    required: body.required,
    isSensitive: body.isSensitive,
    sortOrder: body.sortOrder,
  }
}

const sameScope = (a: CustomFieldDefinition, b: CustomFieldDefinition) =>
  a.id !== b.id &&
  a.entity === b.entity &&
  a.key === b.key &&
  (a.assetTypeId ?? null) === (b.assetTypeId ?? null)

export const configurationHandlers = [
  // --- job types ---
  route('get', '/job-types', ({ auth }) => ok(auth.t.jobTypes), { roles: ALL_ROLES }),

  route<JobTypeInput>(
    'post',
    '/job-types',
    ({ auth, body }) => {
      validateJobType(auth.t, body)
      const jobType = {
        id: newId(),
        ...body,
        checklistTemplateId: body.checklistTemplateId ?? null,
      }
      auth.t.jobTypes.push(jobType)
      return created(jobType)
    },
    { roles: OFFICE_ROLES },
  ),

  route<JobTypeInput>(
    'put',
    '/job-types/{id}',
    ({ auth, body, params }) => {
      const index = auth.t.jobTypes.findIndex((jt) => jt.id === params.id)
      if (index < 0) throw notFound()
      validateJobType(auth.t, body)
      const jobType = {
        id: params.id,
        ...body,
        checklistTemplateId: body.checklistTemplateId ?? null,
      }
      auth.t.jobTypes[index] = jobType
      return ok(jobType)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/job-types/{id}',
    ({ auth, params }) => {
      if (!auth.t.jobTypes.some((jt) => jt.id === params.id)) throw notFound()
      if (auth.t.jobs.some((j) => j.jobTypeId === params.id && !j.deletedAt)) {
        throw conflict('job_type.in_use', 'Jobs of this type exist; deactivate it instead.')
      }
      auth.t.jobTypes = auth.t.jobTypes.filter((jt) => jt.id !== params.id)
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),

  // --- custom fields ---
  route<undefined, ListCustomFieldsParams>(
    'get',
    '/custom-fields',
    ({ auth, query }) =>
      ok(
        auth.t.customFields
          .filter((d) => !query.entity || d.entity === query.entity)
          // Fields without an asset type apply to every asset type
          .filter(
            (d) => !query.assetTypeId || !d.assetTypeId || d.assetTypeId === query.assetTypeId,
          )
          .sort((a, b) => a.sortOrder - b.sortOrder),
      ),
    { roles: ALL_ROLES },
  ),

  route<CustomFieldDefinitionInput>(
    'post',
    '/custom-fields',
    ({ auth, body }) => {
      const definition = customFieldFrom(auth.t, newId(), body)
      if (auth.t.customFields.some((d) => sameScope(d, definition))) {
        throw conflict('custom_field.duplicate_key', 'A field with this key already exists here.')
      }
      auth.t.customFields.push(definition)
      return created(definition)
    },
    { roles: OFFICE_ROLES },
  ),

  route<CustomFieldDefinitionInput>(
    'put',
    '/custom-fields/{id}',
    ({ auth, body, params }) => {
      const index = auth.t.customFields.findIndex((d) => d.id === params.id)
      const current = auth.t.customFields[index]
      if (!current) throw notFound()
      // Stored values depend on these
      if (
        body.key !== current.key ||
        body.entity !== current.entity ||
        body.type !== current.type
      ) {
        throw unprocessable('custom_field.immutable', 'key, entity and type cannot be changed.')
      }
      const definition = customFieldFrom(auth.t, current.id, body)
      if (auth.t.customFields.some((d) => sameScope(d, definition))) {
        const errors = new FieldErrors()
        errors.add('key', MESSAGES.duplicate)
        errors.throwIfAny()
      }
      auth.t.customFields[index] = definition
      return ok(definition)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'delete',
    '/custom-fields/{id}',
    ({ auth, params }) => {
      if (!auth.t.customFields.some((d) => d.id === params.id)) throw notFound()
      // Values stay in the stored JSON but are hidden from now on
      auth.t.customFields = auth.t.customFields.filter((d) => d.id !== params.id)
      return noContent()
    },
    { roles: OFFICE_ROLES },
  ),
]
