import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

/**
 * Three builds: the main process, the preload bridge, and the React renderer.
 *
 * The workspace packages are bundled into main rather than left as runtime
 * imports, so the packaged app does not depend on the monorepo's symlinks.
 */
const WORKSPACE = ['@rb/engine', '@rb/protocol', '@rb/cards']

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: WORKSPACE } },
  },
  preload: {
    build: {
      // A sandboxed preload cannot be an ES module, so it is emitted as CommonJS
      // with a .cjs extension (the package itself is "type": "module").
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    plugins: [react()],
  },
})
