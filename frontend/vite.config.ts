import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // VITE_* env vars are automatically exposed via import.meta.env by Vite.
  // No manual `define` block needed — that would double-inject the values and
  // can cause mismatches between `vite dev` and `vite build`.
})
