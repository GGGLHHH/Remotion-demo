// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * src/components/ui 是 shadcn(base-nova)的产物,由 `shadcn add -c packages/editor <name>`
 * 写入 —— 见同级 components.json,它的 aliases 指向 package.json 的 imports 字段
 * (#components/ui、#lib/utils),所以拉下来的文件开箱就是对的路径。
 *
 * 但这一层**已经不是 byte-identical 上游**:2026-08-11 的工程链对齐把全仓过了一遍
 * eslint --fix(引号、type import 拆分、tailwind class 排序、相对路径换 subpath imports),
 * 这 16 个文件共动了 917/345 行。因此 `shadcn add --dry-run … identical` 那个
 * 「上游动没动」的信号在本仓不可用 —— 要恢复它得先 `shadcn add -o` 重新拉一遍覆盖。
 *
 * 这个快照钉的是**当前内容**:防的是下一次规则调整(或手滑)又把这一层整体改写、
 * 而 diff 淹没在几百个文件里没人注意到。有意升级组件时接受新哈希:
 *   pnpm test -u
 */
const UI = fileURLToPath(new URL('../src/components/ui', import.meta.url))

it('shadcn 组件层的内容被钉住,整体改写会在这里暴露', () => {
  const hashes = Object.fromEntries(
    readdirSync(UI)
      .sort()
      .map((file: string) => [
        file,
        createHash('sha256').update(readFileSync(join(UI, file))).digest('hex').slice(0, 16),
      ]),
  )
  expect(Object.keys(hashes)).toHaveLength(16)
  expect(hashes).toMatchSnapshot()
})
