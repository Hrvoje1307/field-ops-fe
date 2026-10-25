export interface Position {
  lat: number
  lng: number
}

/** How long to wait for the phone's position before going on without it. */
export const POSITION_TIMEOUT_MS = 4000

/**
 * The device's position, or `null` when there is none (no permission, no signal, no
 * support, too slow). It never rejects and never takes longer than `timeoutMs`, so it
 * can sit in front of a request without ever blocking it.
 */
export function currentPosition(timeoutMs: number = POSITION_TIMEOUT_MS): Promise<Position | null> {
  const geolocation = (navigator as Partial<Navigator>).geolocation
  if (!geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    // The browser's own timeout doesn't count the time spent on the permission prompt
    const timer = setTimeout(() => {
      resolve(null)
    }, timeoutMs)
    const done = (position: Position | null) => {
      clearTimeout(timer)
      resolve(position)
    }
    try {
      geolocation.getCurrentPosition(
        ({ coords }) => {
          done({ lat: coords.latitude, lng: coords.longitude })
        },
        () => {
          done(null)
        },
        { timeout: timeoutMs, maximumAge: 60_000 },
      )
    } catch {
      done(null)
    }
  })
}
