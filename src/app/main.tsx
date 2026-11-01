import './styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app'
import { enableMocking } from './providers/mocks'
import { queryClient } from './providers/query-client'
import { connectSession, startSessionWatcher } from './providers/session'
import { router } from './router'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

connectSession()
startSessionWatcher(router, queryClient)

void enableMocking().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
