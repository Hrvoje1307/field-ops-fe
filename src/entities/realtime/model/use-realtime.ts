import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { getSessionStore } from '@/shared/api/session-port'
import { type HubStatus, isSalesEvent, startHub } from '@/shared/api/realtime/hub'
import { setHubLive } from '@/shared/api/realtime/live-status'
import { env } from '@/shared/config/env'

import { renewSession } from '../api'
import { createRefresher } from '../lib/refresher'
import { createSalesRefresher } from '../lib/sales-refresher'
import { channel } from './channel'
import { trackOwnWrites } from './own-writes'

/**
 * Keeps the connection to the hub for as long as the signed-in area is on screen: what
 * it announces marks job data stale (what is shown refetches), a connection that comes
 * back after being lost refreshes too (events were missed), and everything that happens
 * is passed on to `channel`. A new tenant (switching company) is a new connection.
 */
export function useRealtime(tenantId: string): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const refresher = createRefresher(queryClient)
    const salesRefresher = createSalesRefresher(queryClient)
    const writes = trackOwnWrites(queryClient)
    let wasUp = false
    let wasLost = false

    const hub = startHub({
      url: env.hubUrl,
      getAccessToken: () => getSessionStore().getAccessToken(),
      beforeRetry: renewSession,
      onEvent: (event) => {
        // The sales events refresh the sales data they name; job data and the technician's notices are not theirs
        if (isSalesEvent(event)) {
          salesRefresher.handle(event)
          return
        }
        channel.publish({ ...event, own: writes.recent() })
        refresher.push()
      },
      onStatus: (status: HubStatus) => {
        channel.setStatus(status)
        // Screens that poll do it only while the hub is not the way
        setHubLive(status === 'connected')
        if (status === 'connected') {
          // Back after a break: whatever was announced meanwhile was not heard
          if (wasLost) {
            refresher.push()
            salesRefresher.all()
          }
          wasUp = true
          wasLost = false
        } else if (wasUp) {
          wasLost = true
        }
      },
    })

    return () => {
      void hub.stop()
      setHubLive(false)
      refresher.dispose()
      salesRefresher.dispose()
      writes.dispose()
    }
  }, [queryClient, tenantId])
}
