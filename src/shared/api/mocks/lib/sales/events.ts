import type { HubMessage } from '../realtime-events'
import { broadcast } from '../realtime'

type SalesEvent = Extract<HubMessage, { technicianIds: 'sales' }>
type Thin<T extends SalesEvent> = Omit<T, 'technicianIds'>

/**
 * Sales events go to the tenant's connections of users with sales access
 * (group `sales:{tenantId}`). They are thin, like the job events.
 */
export function emitSales(tenantId: string, event: Thin<SalesEvent>): void {
  broadcast(tenantId, [{ ...event, technicianIds: 'sales' } as SalesEvent])
}
