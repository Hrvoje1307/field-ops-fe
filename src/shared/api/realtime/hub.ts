import type {
  DealUpdatedEvent,
  DraftReadyEvent,
  JobStatusChangedEvent,
  JobUpdatedEvent,
  RoutePlanPublishedEvent,
  SalesThreadUpdatedEvent,
} from '../generated/model'

/** The server → client events of the hub (`/hubs/dispatch`). */
export type HubEvent =
  | { type: 'JobUpdated'; payload: JobUpdatedEvent }
  | { type: 'JobStatusChanged'; payload: JobStatusChangedEvent }
  | { type: 'RoutePlanPublished'; payload: RoutePlanPublishedEvent }
  /** Only for users with sales access (group `sales:{tenantId}`). */
  | { type: 'SalesThreadUpdated'; payload: SalesThreadUpdatedEvent }
  | { type: 'DealUpdated'; payload: DealUpdatedEvent }
  | { type: 'DraftReady'; payload: DraftReadyEvent }

export type HubStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export const HUB_EVENT_TYPES = [
  'JobUpdated',
  'JobStatusChanged',
  'RoutePlanPublished',
  'SalesThreadUpdated',
  'DealUpdated',
  'DraftReady',
] as const

/** Events of the Sales module (group `sales:{tenantId}`); their cache refresh comes with step S9. */
export const SALES_EVENT_TYPES: readonly HubEvent['type'][] = [
  'SalesThreadUpdated',
  'DealUpdated',
  'DraftReady',
]

export const isSalesEvent = (event: HubEvent): boolean => SALES_EVENT_TYPES.includes(event.type)

export interface HubOptions {
  url: string
  /** The access token, read at every connection attempt (it may have been renewed). */
  getAccessToken: () => string | null
  /** Called before each attempt after the first, so a token that has expired can be renewed. */
  beforeRetry?: () => Promise<void>
  onEvent: (event: HubEvent) => void
  onStatus: (status: HubStatus) => void
  /** Why an attempt failed (diagnostics). */
  onError?: (error: unknown) => void
  /** Delay before the next attempt, from 0 for the first retry. */
  retryDelay?: (attempt: number) => number
}

/** 0, 2, 5, 10 s, then every 30 s: a connection that is gone is always tried again. */
export const defaultRetryDelay = (attempt: number): number =>
  [0, 2000, 5000, 10_000][attempt] ?? 30_000

export interface Hub {
  stop: () => Promise<void>
}

/**
 * Connects to the SignalR hub and keeps the connection: it is tried again for as long as
 * it is wanted, with growing pauses. The SignalR client is loaded when this is first
 * called, so it is a chunk of its own.
 */
export function startHub(options: HubOptions): Hub {
  const retryDelay = options.retryDelay ?? defaultRetryDelay
  // Read through a function: it changes while awaiting, and TypeScript would narrow a variable
  let stopRequested = false
  const isStopped = () => stopRequested
  let connection: import('@microsoft/signalr').HubConnection | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let wake: (() => void) | undefined

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      wake = resolve
      timer = setTimeout(resolve, ms)
    })

  async function run() {
    const signalr = await import('@microsoft/signalr')
    if (isStopped()) return
    let attempt = 0
    while (!isStopped()) {
      options.onStatus(attempt === 0 ? 'connecting' : 'reconnecting')
      try {
        if (attempt > 0) await options.beforeRetry?.()
        if (isStopped()) return
        // The client reads `WebSocket` from the options although its typings leave it out.
        // It picks the `ws` package when it runs in Node (tests); the page's own WebSocket is
        // what a browser uses anyway, and what the mock can intercept
        const connectionOptions: import('@microsoft/signalr').IHttpConnectionOptions = {
          accessTokenFactory: () => options.getAccessToken() ?? '',
          ...{ WebSocket: globalThis.WebSocket },
        }
        const next = new signalr.HubConnectionBuilder()
          .withUrl(options.url, connectionOptions)
          .configureLogging(signalr.LogLevel.None)
          // A dropped connection is rebuilt by the loop, so the token and the state are fresh
          .build()
        for (const type of HUB_EVENT_TYPES) {
          next.on(type, (payload: HubEvent['payload']) => {
            options.onEvent({ type, payload } as HubEvent)
          })
        }
        const closed = new Promise<void>((resolve) => {
          next.onclose(() => {
            resolve()
          })
        })
        connection = next
        await next.start()
        if (isStopped()) {
          await next.stop()
          return
        }
        attempt = 0
        options.onStatus('connected')
        await closed
      } catch (error) {
        // Not reachable, or refused: the pause below, then another attempt
        options.onError?.(error)
      }
      if (isStopped()) return
      options.onStatus('disconnected')
      await pause(retryDelay(attempt))
      attempt += 1
    }
  }

  void run()

  return {
    stop: async () => {
      stopRequested = true
      clearTimeout(timer)
      wake?.()
      await connection?.stop()
      options.onStatus('disconnected')
    },
  }
}
