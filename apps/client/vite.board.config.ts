/**
 * The board preview harness (src/renderer/src/board/preview.tsx).
 *
 * A plain Vite server for working on the playmat without Electron: the app
 * itself is built by electron-vite. Development only.
 */

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  server: { port: 5199, strictPort: true },
})
