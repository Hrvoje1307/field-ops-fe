import { useEffect, useState } from 'react'

/** The current time in ms, refreshed every `everyMs` (a minute by default) so "due" states move on. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now())
    }, everyMs)
    return () => {
      clearInterval(timer)
    }
  }, [everyMs])
  return now
}
