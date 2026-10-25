import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { getSessionStore } from '@/shared/api/session-port'
import { type HubStatus, startHub } from '@/shared/api/realtime/hub'
import { env } from '@/shared/config/env'

import { renewSession } from '../api'
import { createRefresher } from '../lib/refresher'
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
    const writes = trackOwnWrites(queryClient)
    let wasUp = false
    let wasLost = false

    const hub = startHub({
      url: env.hubUrl,
      getAccessToken: () => getSessionStore().getAccessToken(),
      beforeRetry: renewSession,
      onEvent: (event) => {
        channel.publish({ ...event, own: writes.recent() })
        refresher.push()
      },
      onStatus: (status: HubStatus) => {
        channel.setStatus(status)
        if (status === 'connected') {
          // Back after a break: whatever was announced meanwhile was not heard
          if (wasLost) refresher.push()
          wasUp = true
          wasLost = false
        } else if (wasUp) {
          wasLost = true
        }
      },
    })

    return () => {
      void hub.stop()
      refresher.dispose()
      writes.dispose()
    }
  }, [queryClient, tenantId])
}
