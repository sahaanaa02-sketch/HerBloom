import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { apiBase } from './services/apiBase'

const root = createRoot(document.getElementById('root'))

function renderApp() {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

async function startE2E() {
  try {
    const response = await fetch(apiBase + '/health/e2e', {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('E2E API not ready')
    const status = await response.json()
    if (status.mode !== 'e2e' || status.status !== 'ready') throw new Error('Wrong API')
    renderApp()
  } catch {
    root.render(<p role="alert">The isolated HerBloom E2E API is unavailable. Start the verified E2E backend and reload.</p>)
  }
}

if (import.meta.env.MODE === 'e2e') {
  startE2E()
} else {
  renderApp()
}
