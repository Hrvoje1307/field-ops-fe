import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { enableMocking } from './providers/mocks'
import { connectSession } from './providers/session'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

connectSession()

void enableMocking()
  .catch((error: unknown) => {
    console.error('[MSW] Failed to start the mock API', error)
  })
  .finally(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
