import { hasSalesAccess, hasSalesAi } from '../lib/sales-access'
import { useMe } from './use-me'

/** What the signed-in user may do in Prodaja (the route guard has loaded `/me`). */
export function useSalesAccess(): { hasAccess: boolean; hasAi: boolean } {
  const me = useMe()
  return { hasAccess: hasSalesAccess(me), hasAi: hasSalesAi(me) }
}
