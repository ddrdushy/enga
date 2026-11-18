import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// Every build gets a stamp. The app carries it, and /version.json publishes it,
// so an open app can notice that a newer build is live and ask for a refresh.
const build = new Date().toISOString()

function versionFile(): Plugin {
  return {
    name: 'enga-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD__: JSON.stringify(build) },
})
