import { defineConfig } from 'tsdown'

// 发源码风格库(策略1):开发态 exports 指向 src,发布态(publishConfig)才切 dist。
// peer/deps 由 tsdown 读 package.json 自动 external。
// CSS 不经打包 —— styles.css 作 Tailwind v4 源指令原样随包发布(见 package.json files)。
export default defineConfig({
  entry: { index: 'src/index.ts', adapters: 'src/lib/adapters/index.ts' },
  dts: true,
  sourcemap: true,
  publint: true,
  // 整包都是带状态的交互组件,没有一个能在 RSC 里渲染。tsup 时代这条 banner 在 splitting
  // 下被 esbuild 吞掉,rolldown 会把它放在 import 之上 —— 指令必须在那个位置才生效。
  outputOptions: { banner: '\'use client\'' },
})
