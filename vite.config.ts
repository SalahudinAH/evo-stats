import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One id per build. The app compares it with /version.json to notice a newer deploy.
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 12) || Date.now().toString(36)

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) })
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  base: process.env.BASE_PATH ?? '/',
})
