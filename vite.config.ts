import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/chat/' : '/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
}))