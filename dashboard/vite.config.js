import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base relativa para que el build funcione al abrirlo desde cualquier ruta
// (p. ej. GitHub Pages o un servidor estático sencillo).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
