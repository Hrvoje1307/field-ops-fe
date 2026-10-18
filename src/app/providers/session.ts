import { sessionStore } from '@/entities/session'
import { configureSessionStore } from '@/shared/api/session-port'

/** Gives the API fetcher (shared) access to the session (entities). */
export function connectSession(): void {
  configureSessionStore(sessionStore)
}
