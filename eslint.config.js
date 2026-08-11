// @ts-check
import antfu from '@antfu/eslint-config'
import betterTailwind from 'eslint-plugin-better-tailwindcss'

export default antfu(
  {
    type: 'lib',
    // catalog 检查:子包里写死的版本号会被指出来,让它回到 pnpm-workspace.yaml。
    pnpm: true,
    // @eslint-react + react-hooks + react-refresh。rules-of-hooks 和 exhaustive-deps
    // 是重点;react-x 的 no-* 规则还会顺手把 React 19 的写法迁移过来
    // (forwardRef -> ref prop、Context.Provider -> Context)。
    react: true,
    // 类型感知规则(projectService 会为每个文件找最近的 tsconfig)。
    // 目的是下面的 ts/no-deprecated:作者侧的 @deprecated JSDoc 在每个调用点都可见,
    // 我们自己的和消费方的一样。
    typescript: {
      tsconfigPath: 'tsconfig.json',
      overridesTypeAware: {
        // warn 而非 error:废弃本就是宽限期 —— 符号还能用,划掉 + 报告就是迁移提示。
        'ts/no-deprecated': 'warn',
        // React 19 的 ReactNode 含 Promise,这条规则的 autofix 会把同步 render 回调
        // 改成 async —— 回调此后永远返回 Promise,React 每次渲染都 suspend。太危险。
        'ts/promise-function-async': 'off',
      },
    },
    ignores: [
      // whisper.cpp 的源码检出(装 @remotion/install-whisper-cpp 时落下的),不是本项目代码
      'apps/server/.whisper',
      // 一次性验证脚本的产物与截图
      'tools/fixtures',
      // superpowers 工作流生成的归档(plan/spec/任务报告):写下时是什么样就是什么样的快照,
      // 不是持续维护的文档。里面的代码块大多是半截片段和伪代码,连解析都过不去。
      // 只圈这两个目录 —— docs/ 下手写的 ui-glossary.md、arch-review-*.md 照常受检。
      'docs/superpowers',
      '.superpowers',
    ],
  },
).append({
  name: 'remotion-editor/executables',
  files: ['tools/**/*.mjs', 'apps/server/src/index.ts'],
  rules: {
    // 这两条是 type:'lib' 带来的,针对的是「会被 import 的库代码」:顶层 await 会
    // 逼消费方的 bundler 走 ESM 并阻塞加载,console 会污染宿主输出。
    // 这里的文件都是入口 —— tools/*.mjs 由 node 直接执行(全仓 0 处 import),
    // fastify 的 listen 也只有顶层 await 一种写法,stdout 就是脚本的产品。
    'antfu/no-top-level-await': 'off',
    'no-console': 'off',
  },
}).append({
  name: 'remotion-editor/env-checks',
  files: ['packages/*/src/**'],
  rules: {
    // dev-only 的守卫读 `process.env.NODE_ENV` 这个「全局」—— 打包器只静态替换并
    // tree-shake 这种写法。import node:process 会让替换失效,还会把 polyfill 拖进浏览器包。
    'node/prefer-global/process': ['error', 'always'],
  },
}).append({
  name: 'remotion-editor/react-overrides',
  files: ['packages/*/src/**/*.tsx'],
  rules: {
    // 只是 HMR 的顾虑,对库来说是错的:seam 文件有意把组件和它的变体、类型放在一起导出。
    // packages/* 没有 Fast Refresh;apps/editor 是真 SPA,那条规则在那边照常生效。
    'react-refresh/only-export-components': 'off',
  },
}).append({
  name: 'remotion-editor/tailwind',
  files: ['**/*.tsx'],
  plugins: { 'better-tailwindcss': betterTailwind },
  settings: {
    'better-tailwindcss': {
      // packages/editor 发布的 styles.css 有意不含 `@import "tailwindcss"`(由消费方
      // 自己引入),单独解析不出完整 theme —— 指向 app 的样式入口。
      entryPoint: 'apps/editor/src/index.css',
    },
  },
  rules: {
    // 可自动修复。
    'better-tailwindcss/enforce-canonical-classes': 'error',
    'better-tailwindcss/enforce-consistent-class-order': 'error',
    'better-tailwindcss/enforce-consistent-important-position': 'error',
    'better-tailwindcss/enforce-consistent-line-wrapping': 'error',
    'better-tailwindcss/enforce-consistent-variable-syntax': 'error',
    'better-tailwindcss/enforce-consistent-variant-order': 'error',
    'better-tailwindcss/enforce-logical-properties': 'error',
    'better-tailwindcss/enforce-shorthand-classes': 'error',
    'better-tailwindcss/no-duplicate-classes': 'error',
    'better-tailwindcss/no-unnecessary-whitespace': 'error',

    // 无 autofix,但能抓出「写了却不产生任何 CSS」的类名。
    'better-tailwindcss/no-concatenated-classes': 'error',
    'better-tailwindcss/no-conflicting-classes': 'error',
    'better-tailwindcss/no-deprecated-classes': 'error',
    'better-tailwindcss/no-unknown-classes': ['error', {
      // sonner 自己的钩子类,样式由它的 CSS 提供,不经 tailwind
      ignore: ['toaster'],
    }],
  },
})
