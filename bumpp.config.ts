// `pnpm release`（= bumpp --no-verify）：同步改这几个 package.json 到同一版本，
// 一个 commit + 一个 tag（v%s）+ push，触发 .github/workflows/release.yml 发两个包。
// apps/* 私有不发，不纳入版本；两个发布包与 root 保持同一版本号。
export default {
  files: [
    'package.json',
    'packages/shared/package.json',
    'packages/editor/package.json',
  ],
};
