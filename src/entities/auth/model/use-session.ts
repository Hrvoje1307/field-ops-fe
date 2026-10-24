import { useSyncExternalStore } from 'react'

import { type SessionSnapshot, sessionStore } from './session-store'

const subscribe = (listener: () => void) => sessionStore.subscribe(listener)
const getSnapshot = () => sessionStore.getSnapshot()

/** Re-renders when the session changes (sign-in, sign-out, other tabs). */
export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot)
}
