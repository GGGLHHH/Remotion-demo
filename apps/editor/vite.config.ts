import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 库与 shared 以 TS 源码被消费，防止 react/remotion 出现双实例
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/media'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
