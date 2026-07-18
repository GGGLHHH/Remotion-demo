import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // shared 以 TS 源码被消费，防止 react/remotion 出现双实例
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/media'],
  },
})
