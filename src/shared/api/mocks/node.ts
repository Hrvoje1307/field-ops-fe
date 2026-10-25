import { setupServer } from 'msw/node'

import { handlers } from './handlers'
import { realtimeHandlers } from './lib/realtime'

export const server = setupServer(...handlers, ...realtimeHandlers)
