import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolveApiBase } from './apiConfig.js'

function enforceLocalE2E({ host, port, strictPort }) {
  if (host !== '127.0.0.1' || port !== 5183 || strictPort !== true) {
    throw new Error('E2E frontend requires 127.0.0.1:5183 with strictPort enabled')
  }
}

export default defineConfig(({ mode }) => {
  const plugins = [react(), tailwindcss()]
  // Data Grid is shared by lazy Admin pages. Discover it before navigation.
  const optimizeDeps = { include: ['@mui/x-data-grid'] }
  if (mode !== 'e2e') {
    if (process.env.VERCEL === '1') {
      const backend = new URL(process.env.VITE_API_URL || 'about:blank')
      if (backend.protocol !== 'https:' || backend.username || backend.password ||
          backend.search || backend.hash || backend.pathname !== '/' ||
          !['admin', 'mother'].includes(process.env.VITE_PORTAL_MODE)) {
        throw new Error('Vercel requires a public HTTPS VITE_API_URL and VITE_PORTAL_MODE=admin or mother')
      }
    }
    return { plugins, optimizeDeps }
  }

  const apiBase = resolveApiBase(mode, process.env.VITE_API_URL)
  const localE2E = { host: '127.0.0.1', port: 5183, strictPort: true }
  return {
    plugins: [...plugins, {
      name: 'herbloom-e2e-bind',
      configureServer(server) { enforceLocalE2E(server.config.server) },
      configurePreviewServer(server) { enforceLocalE2E(server.config.preview) },
    }],
    optimizeDeps,
    cacheDir: "node_modules/.vite-e2e",
    envDir: false,
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(apiBase) },
    server: localE2E,
    preview: localE2E,
  }
})
