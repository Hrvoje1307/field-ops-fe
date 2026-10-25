import { useSyncExternalStore } from 'react'

import type { HubEvent, HubStatus } from '@/shared/api/realtime/hub'

/** An event from the hub, and whether it is the echo of something this tab just did. */
export type LiveEvent = HubEvent & { own: boolean }

type EventListener = (event: LiveEvent) => void

/**
 * What the app hears from the hub: its connection state, for the screens that say when
 * live updates are down, and its events, for the ones that tell the user.
 */
export function createChannel(initial: HubStatus = 'disconnected') {
  let status = initial
  /** Since when the connection has not been up (null while it is). */
  let downSince: number | null = initial === 'connected' ? null : Date.now()
  const statusListeners = new Set<() => void>()
  const eventListeners = new Set<EventListener>()

  return {
    getStatus: () => status,
    getDownSince: () => downSince,
    setStatus(next: HubStatus) {
      if (next === status) return
      status = next
      if (next === 'connected') downSince = null
      else downSince ??= Date.now()
      for (const listener of statusListeners) listener()
    },
    subscribeStatus(listener: () => void) {
      statusListeners.add(listener)
      return () => {
        statusListeners.delete(listener)
      }
    },
    publish(event: LiveEvent) {
      for (const listener of eventListeners) listener(event)
    },
    subscribeEvents(listener: EventListener) {
      eventListeners.add(listener)
      return () => {
        eventListeners.delete(listener)
      }
    },
  }
}

export type Channel = ReturnType<typeof createChannel>

/** The one channel of this tab. */
export const channel: Channel = createChannel()

const subscribeStatus = (listener: () => void) => channel.subscribeStatus(listener)
const getStatus = () => channel.getStatus()

/** The state of the hub connection. */
export function useRealtimeStatus(): HubStatus {
  return useSyncExternalStore(subscribeStatus, getStatus)
}
