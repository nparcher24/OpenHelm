import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loggingPlugin } from './vite-plugins/logging-plugin.js'

export default defineConfig({
  plugins: [react(), loggingPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom']
        }
      }
    }
  }
})