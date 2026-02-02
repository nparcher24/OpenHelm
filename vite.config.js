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
    terserOptions: {
      compress: { drop_console: true }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          maplibre: ['maplibre-gl'],
          three: ['three', '@react-three/fiber', '@react-three/drei']
        }
      }
    },
    sourcemap: false
  }
})