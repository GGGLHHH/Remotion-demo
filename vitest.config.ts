import { defineConfig } from 'vitest/config'

// 单一根配置收编两个包的测试。测试都是纯逻辑(时间线几何、ops、history、字幕解析),
// 不渲染组件,所以留在默认 node 环境 —— 要测组件了再加 jsdom + @vitejs/plugin-react。
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
})
