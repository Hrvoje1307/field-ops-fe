export type {
  Client,
  ClientSummary,
  ClientSummaryPage,
  ClientType,
  Contact,
  ListClientsParams,
} from '@/shared/api/generated/model'
export { clientKeys, getClient, listClients, lookupClientByPhone } from './api'
export { CLIENT_STALE_TIME } from './const'
export { ContactLine } from './ui/contact-line'
