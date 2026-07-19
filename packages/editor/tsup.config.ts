import { defineConfig } from 'tsup';

// 发源码风格库（策略1）：出 ESM + .d.ts。peer/deps 自动 external（tsup 读 package.json）。
// CSS 不经 tsup —— styles.css 作 Tailwind v4 源指令原样随包发布（见 package.json exports）。
// 注：整包 "use client" banner 在 splitting bundle 下被 esbuild 忽略；RSC 逐文件指令保留留作后续
//    （需 esbuild-plugin-preserve-directives）。普通 React/Vite 消费方不受影响。
export default defineConfig({
  entry: { index: 'src/index.ts', adapters: 'src/lib/adapters/index.ts' },
  format: ['esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
});
