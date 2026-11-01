import { env } from '@/shared/config/env'

/** Starts the MSW worker when VITE_API_MOCK=true; all of it is dropped from other builds. */
export async function enableMocking(): Promise<void> {
  // Inline env check (not env.apiMock) so the bundler can drop MSW from non-mock builds.
  if (import.meta.env.VITE_API_MOCK !== 'true') return

  try {
    const { worker } = await import('@/shared/api/mocks/browser')
    await worker.start({
      // Warn about unmocked API calls, silently pass through everything else (Vite assets, fonts…)
      onUnhandledFrame({ frame, defaults }) {
        if (frame.protocol !== 'http') return
        const { request } = frame.data as { request: Request }
        if (request.url.startsWith(env.apiUrl)) defaults.warn()
      },
    })
  } catch (error: unknown) {
    // The app starts anyway; its requests then go to the real API address
    console.error('[MSW] Failed to start the mock API', error)
  }
}
