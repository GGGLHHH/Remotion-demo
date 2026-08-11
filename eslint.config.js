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
      // 设计文档与 agent 生成的报告。里面的代码块是示意片段(常年是半截函数、
      // 顶层 hook 调用),按真代码检查只会产出噪声。
      'docs',
      '.superpowers',
    ],
  },
).append({
  name: 'remotion-editor/verify-scripts',
  files: ['tools/**/*.mjs'],
  rules: {
    // 一次性的人工验证脚本:node 直接跑,顶层 await 是它们的正常形态,
    // 输出到 stdout 就是它们的产品。库那套规矩不适用。
    'antfu/no-top-level-await': 'off',
    'no-console': 'off',
    // 同理,这些脚本不值得为 process/Buffer 逐个补 import —— apps/server 那边补了,
    // 因为那是长期维护的服务代码。
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
  },
}).append({
  name: 'remotion-editor/server-entry',
  files: ['apps/server/src/index.ts'],
  rules: {
    // fastify 服务的入口:listen 就是顶层 await,没有别的写法。
    'antfu/no-top-level-await': 'off',
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
}).append({
  name: 'remotion-editor/markdown-snippets',
  files: ['**/*.md/**'],
  rules: {
    // README 里的示例片段是给人读的,不参与 Fast Refresh,也不必凑齐可运行上下文
    'react-refresh/only-export-components': 'off',
    'ts/explicit-function-return-type': 'off',
  },
})
