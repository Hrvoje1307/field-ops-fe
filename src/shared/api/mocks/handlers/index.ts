import { assetHandlers } from './assets'
import { attachmentHandlers } from './attachments'
import { authHandlers } from './auth'
import { clientHandlers } from './clients'
import { configurationHandlers } from './configuration'
import { dispatchHandlers } from './dispatch'
import { fieldHandlers } from './field'
import { jobHandlers } from './jobs'
import { locationHandlers } from './locations'
import { messageTemplateHandlers } from './message-templates'
import { reportHandlers } from './reports'
import { routePlanHandlers } from './route-plans'
import { technicianHandlers } from './technicians'
import { tenantHandlers } from './tenant'

/**
 * Contract-faithful mock of the FieldOps API (see CLAUDE.md, "Mock API").
 * One file per OpenAPI tag; add handlers together with the screen that needs them.
 */
export const handlers = [
  ...authHandlers,
  ...tenantHandlers,
  ...technicianHandlers,
  ...clientHandlers,
  ...locationHandlers,
  ...assetHandlers,
  ...jobHandlers,
  ...dispatchHandlers,
  ...routePlanHandlers,
  ...reportHandlers,
  ...attachmentHandlers,
  ...fieldHandlers,
  ...configurationHandlers,
  ...messageTemplateHandlers,
]
