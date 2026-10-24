export type {
  Client,
  ClientCreate,
  ClientSummary,
  ClientSummaryPage,
  ClientType,
  Contact,
  ListClientsParams,
} from '@/shared/api/generated/model'
export { clientKeys, createClient, getClient, listClients, lookupClientByPhone } from './api'
export { CLIENT_STALE_TIME } from './const'
export { ClientFields } from './ui/client-fields'
export { ClientMatch } from './ui/client-match'
export { ContactLine } from './ui/contact-line'
