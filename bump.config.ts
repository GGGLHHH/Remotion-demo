import { defineConfig } from 'bumpp';

// `pnpm release`（= bumpp --no-verify）读此文件：同步改这几个 package.json 到同一版本，
// 一个 commit（chore: release vX）+ 一个 tag（vX）+ push，触发 .github/workflows/release.yml。
// apps/* 私有不发、不纳入版本；两个发布包与 root 保持同一版本号。
// 注意：bumpp 认的配置文件名是 bump.config.ts（不是 bumpp.config.ts）。
export default defineConfig({
  files: [
    'package.json',
    'packages/shared/package.json',
    'packages/editor/package.json',
  ],
});
