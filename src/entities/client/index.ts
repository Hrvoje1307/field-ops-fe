export type {
  Client,
  ClientCreate,
  ClientSummary,
  ClientSummaryPage,
  ClientType,
  ClientUpdate,
  Contact,
  ContactInput,
  ListClientsParams,
} from '@/shared/api/generated/model'
export {
  clientKeys,
  createClient,
  deleteClient,
  getClient,
  listClients,
  lookupClientByPhone,
  updateClient,
} from './api'
export { CLIENT_STALE_TIME } from './const'
export {
  buildClientSchema,
  type ClientFormValues,
  clientFormValues,
  type ContactFormValue,
  toClientBody,
} from './model/client-form'
export { handleClientConflict } from './model/conflict'
export { CallButton } from './ui/call-button'
export { ClientFields } from './ui/client-fields'
export { ClientMatch } from './ui/client-match'
export { ClientProfileFields } from './ui/client-profile-fields'
export { ContactsFields } from './ui/contacts-fields'
export { ContactLine } from './ui/contact-line'
