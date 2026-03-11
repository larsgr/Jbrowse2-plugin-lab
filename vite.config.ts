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
      // xz-decompress maps stream/web to false for browser environments
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
  optimizeDeps: {
    include: ['@jbrowse/core', '@jbrowse/react-linear-genome-view'],
  },
})

