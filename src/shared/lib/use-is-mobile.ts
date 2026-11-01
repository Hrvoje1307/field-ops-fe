import { useSyncExternalStore } from 'react'

/** The phone layout: this wide or narrower (CSS `max-md` is one pixel narrower; screens use this for what CSS cannot do). */
export const MOBILE_QUERY = '(max-width: 768px)'

const subscribe = (listener: () => void) => {
  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener('change', listener)
  return () => {
    media.removeEventListener('change', listener)
  }
}
const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches
const getServerSnapshot = () => false

/** True on a phone-sized screen; follows the window as it is resized or turned. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
