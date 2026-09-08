import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const codespaceName = process.env.CODESPACE_NAME
const codespaceHost = codespaceName ? `${codespaceName}-5173.app.github.dev` : null

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['.app.github.dev'],
    ...(codespaceHost ? {
      hmr: {
        protocol: 'wss',
        host: codespaceHost,
        clientPort: 443,
      },
    } : {}),
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.app.github.dev'],
  },
})
