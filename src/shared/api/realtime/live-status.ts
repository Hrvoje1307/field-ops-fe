import { useSyncExternalStore } from 'react'

let live = false
const listeners = new Set<() => void>()

/** The hub says it is connected (set by the realtime entity; false whenever it is not). */
export function setHubLive(next: boolean): void {
  if (next === live) return
  live = next
  for (const listener of listeners) listener()
}

export const isHubLive = (): boolean => live

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Whether live updates are on. Data that only needs reading again because something
 * happened is refreshed by the hub's events while this is true; a screen that polls does it
 * only while it is false (the hub is the way, polling is the reserve).
 */
export function useHubLive(): boolean {
  return useSyncExternalStore(subscribe, isHubLive)
}
