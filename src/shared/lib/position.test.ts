import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentPosition } from './position'

type Geolocation = Pick<globalThis.Geolocation, 'getCurrentPosition'>
const setGeolocation = (geolocation: Geolocation | undefined) => {
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
}

afterEach(() => {
  vi.useRealTimers()
  setGeolocation(undefined)
})

describe('currentPosition', () => {
  it('the device position', async () => {
    setGeolocation({
      getCurrentPosition: (success) => {
        success({ coords: { latitude: 45.8, longitude: 15.97 } } as GeolocationPosition)
      },
    })
    await expect(currentPosition()).resolves.toEqual({ lat: 45.8, lng: 15.97 })
  })

  it('null when denied, unsupported or throwing', async () => {
    setGeolocation({
      getCurrentPosition: (_success, error) => {
        error?.({ code: 1 } as GeolocationPositionError)
      },
    })
    await expect(currentPosition()).resolves.toBeNull()
    setGeolocation(undefined)
    await expect(currentPosition()).resolves.toBeNull()
    setGeolocation({
      getCurrentPosition: () => {
        throw new Error('blocked by policy')
      },
    })
    await expect(currentPosition()).resolves.toBeNull()
  })

  it('null once the time is up, even if the browser never answers', async () => {
    vi.useFakeTimers()
    setGeolocation({ getCurrentPosition: () => undefined })
    const result = currentPosition(4000)
    await vi.advanceTimersByTimeAsync(3999)
    let settled = false
    void result.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBeNull()
  })
})
