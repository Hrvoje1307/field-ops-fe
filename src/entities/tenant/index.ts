export type { Tenant } from '@/shared/api/generated/model'
export { fetchTenant, getTenant, tenantKeys } from './api'
export { TENANT_STALE_TIME } from './const'
export { useTenantSettings } from './model/use-tenant-settings'
