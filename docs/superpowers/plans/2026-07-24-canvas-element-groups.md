# 画布元素分组 — 实现计划

> 配套设计:`docs/superpowers/specs/2026-07-24-canvas-element-groups-design.md`。
> 执行方式:本会话内联实现,每期末 typecheck + build + test 验证。步骤用 checkbox 跟踪。

**Goal:** 画布持久分组(组合/拆分)作为库层原语 + v2 用组做 clip 多入参(hero + 参考图)。

**Global Constraints:**
- 对外 API 只增不改;`UndoableState` 加 `groups` 为零迁移加法字段。
- 单一真相源 = `groups`;item 不加 `groupId`。
- 一起移动已支持,不动;不做整组缩放/旋转。
- 每期末:`pnpm -C packages/editor typecheck && build && test` 全绿;下游 workbench-v2 `tsc -b` 绿。

---

## 期 1:库层 group 原语

### Task 1.1 — 数据模型(shared)
- Modify: `packages/shared/src/types.ts` — 加 `export type Group = { id: string; itemIds: string[] }`;`UndoableState` 加 `groups: Record<string, Group>`。
- Modify: `packages/shared/src/factories.ts` — `createEmptyState` 加 `groups: {}`。
- Modify: `packages/shared/src/index.ts` — 导出 `Group` 类型 + 稍后的 `findGroupOfItem`。

### Task 1.2 — 纯函数 + 单测(shared)
- Create: `packages/shared/src/groups.ts`
  - `findGroupOfItem(groups, itemId): Group | undefined`
  - `expandSelectionWithGroups(ids, groups): string[]`(去重、补全整组)
  - `pruneGroups(groups, liveItemIds: Set<string>): Record<string,Group>`(摘除死成员、删 <2 成员的组;返回同引用若无变化)
  - `groupFromSelection(groups, selectedIds, newId): {groups, groupId} | null`(≥2 去重成员建组、旧组摘出)
  - `ungroupBySelection(groups, selectedIds): Record<string,Group>`(删选中涉及的组)
- Create: `packages/shared/src/__tests__/groups.test.ts` — 覆盖:expand 补全/去重/无组直返、prune 删死成员与孤组、group 建组去嵌套、ungroup。
- Modify: `packages/shared/src/index.ts` — 导出这些纯函数中 v2/库需要的(`findGroupOfItem`,其余库内部用可不导出)。

### Task 1.3 — store 接线
- Modify: `packages/editor/src/state/store.ts`
  - `EditorStore` 类型加 `groupSelected(): void`、`ungroupSelected(): void`。
  - init 回填:`groups: init.undoable.groups ?? {}`(与 transitions 同处)。
  - `setSelected(ids)`:改为 `set({ selectedItemIds: expandSelectionWithGroups(ids, get().undoable.groups), selectedTransitionId: null })`。
  - `groupSelected`:`updateUndoable` 里 `groupFromSelection(groups, selectedItemIds, newId())`;成功后无需改 selection(已整组选中)。
  - `ungroupSelected`:`updateUndoable` 里 `ungroupBySelection`。
  - `deleteSelected`:return 前 `groups: pruneGroups(s.groups, 剩余 itemIds 集合)`。

### Task 1.4 — 持久化回填
- Modify: `packages/editor/src/persistence/persistence.ts` — `deserializeState` 加 `parsed.groups ??= {}`。

### Task 1.5 — 跨切面维护(split / paste)
- Modify: `packages/editor/src/timeline/ops.ts`(`splitItemsAtFrame`) — 分割产生新半 id 时,若原 item 属某组,把新 id 加进该组。(读现有实现后定改法;若 split 不在此维护组,则在 store 调用处包一层。)
- Modify: `packages/editor/src/lib/clipboard.ts`(`placeItems`) — 若被复制 item **全部**同属一组,给副本 id 建新组;否则不建。
- 补测:`packages/editor/src/lib/*.test.ts` 或就近,验证 split 保组、duplicate 建新组。

**期 1 验证:** editor + shared typecheck/build/test 全绿。

---

## 期 2:库层交互

### Task 2.1 — 命令面
- Modify: `packages/editor/src/lib/commands.ts` — `EditorCommands` 加 `group()`/`ungroup()`;实现调 `api.getState().groupSelected()/ungroupSelected()`。

### Task 2.2 — 快捷键
- Modify: `packages/editor/src/shortcuts/useShortcuts.ts` — `mod && key==='g'`:`e.shiftKey ? ungroupSelected() : groupSelected()`;`preventDefault`。

### Task 2.3 — 右键菜单 + 组包围盒
- Modify: `packages/editor/src/canvas/SelectionOverlay.tsx`
  - `ContextMenuContent` 加「组合」(选中 ≥2 且未成组时)/「取消组合」(选中含组时)。
  - 选中的可见项同属一组 → 画一个浅色虚线包围盒(成员 bbox)。
- Modify: locale `zh.json`/`en.json` — `selectionOverlay.group` / `selectionOverlay.ungroup`。

### Task 2.4 — 导出
- Modify: `packages/editor/src/index.ts` — 无需新导出(group/ungroup 经 useEditorCommands;groups 经 useEditor)。确认 `Group` 从 `@gedatou/shared` 可达。

**期 2 验证:** editor typecheck/build/test 全绿;locale 键对齐。

---

## 期 3:v2 多入参 · B 批量按序(默认)

> 语义已定稿为**双模式**(见 spec):组是"顺序平行"的对等元素,非 hero/参考。本期做 **B(默认)** + 多图 Prompt Assist;**改造**已落地的 hero+参考图 `ClipGroupGenerate`。A 见期 4。

### Task 3.1 — 多图 Prompt Assist(server/bff/前端)
- Modify: `workbench-v2/server/src/clip/prompt-assist.ts` — `imageUrl` → `imageUrls: string[]`(单个保后兼容);多张 inline 一起喂 Gemini,指令按"有序多图/统一运镜"产出一条正文;mock 分支不变。
- Modify: `workbench-v2/bff/src/clip-prompt-assist.ts` — 请求体加 `imageUrls`(逐个 `resolveImageUrl`);`pnpm generate` 重生成 client。
- Modify: `workbench-v2/src/api/prompt-assist.ts`(若签名变)。

### Task 3.2 — B 模式面板(改造 `ClipGroupGenerate`)
- Modify: `workbench-v2/src/components/clip-generator/clip-group-generate.tsx`
  - 去掉 hero+参考图语义;改为**模式切换** `○ 各生成一条(B) / ○ 串成一条(A)`,B 默认,A 先置灰(期 4 接)。
  - B:对组内每张图各调 `generateBffClip`(可并行),保序;各自 take。
  - 「AI 生成提示词」按钮:调多图 Prompt Assist 填入共用 promptBody。
- Modify: locale `zh.json`/`en.json` — 调整 `clipGen.group*`(去掉 hero/ref 文案,加模式切换/批量文案)。

**期 3 验证:** workbench-v2 typecheck + build + test 全绿;locale 对齐;HTTP mock 冒烟(多图 prompt-assist)。

---

## 期 4:v2 多入参 · A 首尾帧进阶

### Task 4.1 — 关键帧通道(server/provider)
- Modify: `workbench-v2/server/src/clip/*` — `generateClip` 入参加"首帧+末帧";给 Kling/Luma provider 适配首尾帧;`ProviderOption` 加 `keyframes: { supported, max }`;`/api/generate-clip` 请求体加 `startImageUrl`/`endImageUrl`。
- Modify: `workbench-v2/bff/src/clips.ts` — `/bff/clips` 请求体加 `startImageUrl`/`endImageUrl`(`resolveImageUrl`);provider 目录透传 `keyframes` 能力位;`pnpm generate`。

### Task 4.2 — A 模式面板
- Modify: `clip-group-generate.tsx` — A 模式:首图=首帧、末图=末帧 → 一条 clip;仅 `keyframes.supported` 的 provider 可选,否则 A 置灰+提示;A 提示词走多图 Prompt Assist(整段运动)。

**期 4 验证:** 同期 3。

---

**期 3/4 全局约束**:B 默认、A 门槛化(仅支持关键帧的 provider);单图路径不变;`referenceImageUrls` 通道不再用于组多入参。

---

## 自查

- 覆盖:设计里"数据模型/撤销持久化/操作/交互/v2 消费"各有对应 Task。二期明确不做项不在计划内。
- 类型一致:`Group`/`groups`/`findGroupOfItem`/`expandSelectionWithGroups`/`pruneGroups` 命名全程一致。
- 无占位:纯函数与 store 改法均已具体到函数签名与调用点。
