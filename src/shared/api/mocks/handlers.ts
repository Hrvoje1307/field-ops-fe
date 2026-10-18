import type { HttpHandler } from 'msw'

// Contract-faithful handlers are added together with the screen that needs them (see CLAUDE.md).
export const handlers: HttpHandler[] = []
