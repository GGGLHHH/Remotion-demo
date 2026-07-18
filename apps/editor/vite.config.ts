import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // shared 以 TS 源码被消费，防止 react/remotion 出现双实例
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/media'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
