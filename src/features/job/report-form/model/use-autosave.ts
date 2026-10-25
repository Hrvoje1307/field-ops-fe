import { useCallback, useEffect, useRef, useState } from 'react'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'failed'

interface Options {
  /** Quiet time after the last change before saving. */
  delay?: number
  /** Time before trying again after a failed save. */
  retryDelay?: number
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Saves `value` a moment after it stops changing, and again after a failure, so a
 * request that fails never costs the user their input (it stays in the form and is
 * sent when the network is back). `saved` is what is already on the server.
 * `flush()` saves now and resolves when the latest value is on the server (it throws
 * if that fails); the page leaving or going to the background also flushes.
 */
export function useAutosave<T>(
  value: T,
  saved: T,
  save: (value: T) => Promise<unknown>,
  { delay = 800, retryDelay = 5000 }: Options = {},
) {
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const latest = useRef(value)
  const onServer = useRef(saved)
  const saver = useRef(save)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const running = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  // `run` schedules its own retry; it reaches itself through here
  const again = useRef<() => void>(() => undefined)

  useEffect(() => {
    latest.current = value
    saver.current = save
  })

  const setIfMounted = useCallback((next: AutosaveStatus) => {
    if (mounted.current) setStatus(next)
  }, [])

  /** One round: sends what is newest until there is nothing left to send. Throws on failure. */
  const run = useCallback((): Promise<void> => {
    if (running.current) return running.current
    const round = (async () => {
      try {
        while (!same(latest.current, onServer.current)) {
          const sending = latest.current
          setIfMounted('saving')
          await saver.current(sending)
          onServer.current = sending
        }
        setIfMounted('saved')
      } catch (error) {
        setIfMounted('failed')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          again.current()
        }, retryDelay)
        throw error
      } finally {
        running.current = null
      }
    })()
    running.current = round
    return round
  }, [retryDelay, setIfMounted])

  useEffect(() => {
    again.current = () => {
      void run().catch(() => undefined)
    }
  }, [run])

  // A change is saved after `delay` of quiet
  useEffect(() => {
    clearTimeout(timer.current)
    if (same(value, onServer.current)) return
    timer.current = setTimeout(() => {
      void run().catch(() => undefined)
    }, delay)
    return () => {
      clearTimeout(timer.current)
    }
  }, [value, delay, run])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    // A round that is already running may have started before the last change
    if (running.current) await running.current.catch(() => undefined)
    if (!same(latest.current, onServer.current)) await run()
  }, [run])

  // Leaving the page or the app going to the background saves what is there
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush])

  // Leaving the screen saves too
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (!same(latest.current, onServer.current)) void run().catch(() => undefined)
    }
  }, [run])

  return { status, flush }
}
