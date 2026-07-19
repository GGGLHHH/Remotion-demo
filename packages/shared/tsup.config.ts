import { defineConfig } from 'tsup';

// 数据模型 + Remotion 合成，双入口（. / ./composition）。peer（react/remotion 全家）自动 external。
export default defineConfig({
  entry: { index: 'src/index.ts', composition: 'src/composition/index.ts' },
  format: ['esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
});
