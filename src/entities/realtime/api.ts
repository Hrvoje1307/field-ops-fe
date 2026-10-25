import { apiFetch } from '@/shared/api/api-fetch'
import type { Me } from '@/shared/api/generated/model'

/**
 * A cheap request that renews the access token if it has expired (the fetcher refreshes
 * on 401). The hub takes its token from the session, so it is called before the
 * connection is tried again.
 */
export async function renewSession(): Promise<void> {
  await apiFetch<Me>('/me')
}
