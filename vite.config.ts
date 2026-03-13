import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // JBrowse2 uses Node.js built-ins (Buffer, etc.) — polyfill them for browser
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'path'],
      globals: { Buffer: true },
    }),
  ],
  resolve: {
    alias: {
      // xz-decompress (a JBrowse2 dependency) includes `stream/web` which is a
      // Node.js built-in. The package maps it to `false` for browser environments
      // (see its package.json "browser" field), but Vite resolves the polyfilled
      // `stream` module first, then fails trying to find a `web` sub-export.
      // Mapping to an empty module replicates the intended "not available" behavior.
      'stream/web': 'data:text/javascript,export default {}',
    },
  },
  // Base path for GitHub Pages deployment
  // For repo at https://github.com/larsgr/Jbrowse2-plugin-lab,
  // GitHub Pages serves from https://larsgr.github.io/Jbrowse2-plugin-lab/
  base: '/Jbrowse2-plugin-lab/',
  build: {
    outDir: 'dist',
  },
})

