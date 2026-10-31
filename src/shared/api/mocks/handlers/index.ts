import { assetHandlers } from './assets'
import { attachmentHandlers } from './attachments'
import { authHandlers } from './auth'
import { clientHandlers } from './clients'
import { configurationHandlers } from './configuration'
import { dispatchHandlers } from './dispatch'
import { fieldHandlers } from './field'
import { jobHandlers } from './jobs'
import { locationHandlers } from './locations'
import { messageHandlers } from './messages'
import { messageTemplateHandlers } from './message-templates'
import { publicHandlers } from './public'
import { reportHandlers } from './reports'
import { routePlanHandlers } from './route-plans'
import { salesConfigHandlers } from './sales-config'
import { salesDealHandlers } from './sales-deals'
import { salesDraftHandlers } from './sales-drafts'
import { salesMailboxHandlers } from './sales-mailboxes'
import { salesReportHandlers } from './sales-reports'
import { salesThreadHandlers } from './sales-threads'
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
  ...messageHandlers,
  ...publicHandlers,
  ...salesMailboxHandlers,
  ...salesThreadHandlers,
  ...salesDealHandlers,
  ...salesDraftHandlers,
  ...salesConfigHandlers,
  ...salesReportHandlers,
]
