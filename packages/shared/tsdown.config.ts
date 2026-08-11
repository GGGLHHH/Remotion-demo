import { defineConfig } from 'tsdown'

// 数据模型 + Remotion 合成,双入口(. / ./composition)。合成侧要能在 Node 渲染进程里跑,
// 所以这里不加 'use client' banner。peer(react/remotion 全家)自动 external。
export default defineConfig({
  entry: { index: 'src/index.ts', composition: 'src/composition/index.ts' },
  dts: true,
  sourcemap: true,
  publint: true,
})
