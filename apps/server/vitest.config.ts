import { configDefaults, defineConfig } from 'vitest/config';

// .whisper 是 whisper.cpp 源码检出（自带测试文件），不属于本项目测试
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, '.whisper/**'], passWithNoTests: true },
});
