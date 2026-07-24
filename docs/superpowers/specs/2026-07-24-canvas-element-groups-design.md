# 画布元素分组(组合/拆分)+ 多元素入参 — 设计

> 状态:已确认。2026-07-24。范围:`@gedatou/editor` + `@gedatou/shared` 库层通用原语,workbench-v2 业务消费。

## 目标

画布框选后可把多个元素**组合**成一个持久的组;组可**拆分**;组的成员可作为**多元素入参**喂给下游(clip 生成、Prompt Assist、未来需求)。

已定决策:
- **轻量持久组**:一起选中 / 一起拖动 / 可拆分 / 作多入参。**不含整组缩放/旋转**(二期,难点后置)。
- **多入参语义:一组是"顺序平行"的对等元素(有先后次序、彼此平级,无主辅)**,不是 hero/参考图。
- **双模式生成,用户自选(B 默认 / A 首尾帧进阶)**:
  - **B 批量按序(默认)**:组内每张图各自生成一条独立 clip,按选中次序落到时间轴。复用现有单图链路 × N,全 provider 可用,保真最稳。
  - **A 首尾帧串成一条(进阶)**:组的**首图=首帧、末图=末帧**,插值出中间过渡 → **一条**穿过序列的视频。仅支持关键帧的 provider(Kling 首尾帧、Luma keyframes)可选,不支持时置灰。**v1 只做首尾两帧**(多关键帧后置)。过渡段必然松开保真,故仅作进阶选项、非默认。
- **两步流水线**:先 **AI 辅助看整组生成提示词** → 再生成 clip。B 提示词可"共用一条 / 逐张"(逐张后配),A 提示词为"整段运动"一条。→ Prompt Assist 需支持**多图入参**(原二期项提到正题)。

> 作废声明:本设计早期版本(以及已在 v2 落地的 `ClipGroupGenerate` 首版)采用"首图 hero + 其余参考图"的**主辅**语义,现已**推翻**——`referenceImageUrls` 通道保留给别的用途,组的多入参改走上述双模式。已落地的 hero+参考图版本视为**待改造**(降级为 B,并新增 A + 模式切换)。

## 分层(对齐"走过北极星")

- **组合/拆分 = 库层通用原语**:纯编辑器概念(元素一起选/一起移)。库出原语,不掺业务。
- **多元素入参 = v2 业务消费**:v2 读某组的 `itemIds` 当生成入参。库不认识 clip/hero/参考图。

## 数据模型(`packages/shared/src/types.ts`)

```ts
export type Group = { id: string; itemIds: string[] }; // v1:无名字、无嵌套
// UndoableState 增字段:
groups: Record<string, Group>;
```

- **单一真相源**只放 `groups`。item **不加** `groupId`(避免双写不一致);item→组反查用纯函数 `findGroupOfItem(groups, itemId)`(组数量少,扫描即可)。
- 不变量:一个 item 至多属于一个组;组成员 ≥2(降到 1 自动解散);组只引用存在的 item。

## 撤销 / 持久化(零迁移加法)

- 撤销**白拿**:`past/future` 存整个 `UndoableState` 快照,`groups` 天然进撤销。
- `createEmptyState` 补 `groups: {}`;store 初始态回填 `groups: init.undoable.groups ?? {}`;`deserializeState` 补 `parsed.groups ??= {}`。旧存档 `groups===undefined` → `{}`,零迁移(与现有 `transitions ??= {}` 同款)。

## 库层操作(`state/store.ts` + 纯函数 `state/groups.ts`)

纯函数(可单测,无 React/store):
- `findGroupOfItem(groups, itemId): Group | undefined`
- `expandSelectionWithGroups(ids, groups): string[]` — 选中集里任一 id 属于某组 → 补全该组全部成员,去重。
- `pruneGroups(groups, liveItemIds): Record<string,Group>` — 摘除已不存在的成员;成员 <2 的组删除。

store:
- **`setSelected(ids)` 单点收口**:`set({ selectedItemIds: expandSelectionWithGroups(ids, undoable.groups), ... })`。所有选择入口(单击/框选/加选/Cmd+A/右键)自动整组选中——关键收口,不在每处补。
- `groupSelected()`:当前 `selectedItemIds`(去重后 ≥2)建新组;成员先从旧组摘出(不嵌套);空掉的旧组由 `pruneGroups` 清理。commit。
- `ungroupSelected()`:删除当前选中所涉及的所有组。commit。
- `deleteSelected()`:删除 item 后 `groups = pruneGroups(groups, 剩余 itemIds)`(照现有 transition 孤儿清理写法)。

跨切面维护(v1 必做的正确性):
- **删除**:`pruneGroups`(见上)。
- **分割 `splitItemsAtFrame`**:被分割 item 的两半都留在原组(把新半的 id 加进该组)。
- **复制/粘贴/副本 `placeItems`**:整组复制时给副本建**新组**(id 重映射);跨组或部分复制则不建组。

## 库层交互(`canvas/SelectionOverlay.tsx` + `shortcuts/useShortcuts.ts` + `lib/commands.ts`)

- **一起移动**:已支持(多选拖动 `startRects`),零改动。
- **组包围盒**:选中的可见项若同属一组,多画一个浅色包围盒轮廓(成员 bbox 的一个 rect,虚线/浅色)。**不加缩放/旋转手柄**。
- **快捷键**:`Cmd+G` → `groupSelected`;`Cmd+Shift+G` → `ungroupSelected`(加进 `useShortcuts`;`isEditableTarget` 时不触发)。
- **右键菜单**:在 bringToFront/sendToBack 附近加「组合 / 取消组合」(选中 ≥2 时显示组合;选中含组时显示取消组合)。
- **命令面**:`useEditorCommands` 增 `group()` / `ungroup()`;`EditorCommands` 类型补两项。
- **框选不自动成组**:框选/加选后按 Cmd+G 或菜单才成组(符合直觉)。

## 公开 API(`packages/editor/src/index.ts` + `packages/shared/src/index.ts`)

- shared 导出 `Group` 类型 + `findGroupOfItem`(v2 反查用)。
- editor:`useEditorCommands` 暴露 `group`/`ungroup`;`groups` 经 `useEditor(s => s.undoable.groups)` 可读(无需新导出)。

## v2 消费(双模式)

现状卡在 `selectedItemIds.length === 1`。改造:选中一组 ≥2 张**图片**(画布成组后整组选中)→ 出**组合生成**面板,含**模式切换** `○ 各生成一条(B) / ○ 串成一条(A)`。

**B 批量按序(默认,`workbench-v2` clip 面板 + api)**
- 每张图各调一次现有 `generateBffClip`(单图链路),可并行;结果按选中次序保序。
- 提示词:v1 共用一条(逐张后配);先接**多图 Prompt Assist**产出这条。
- 全 provider 可用,`sourceImageRef` 各自为该图,落各自 take。零新通道。

**A 首尾帧串成一条(进阶)**
- 新增**关键帧通道**(库外、v2 server/bff/provider 层):
  - server `/api/generate-clip` 与 bff `/bff/clips` 请求体加 `startImageUrl`/`endImageUrl`(或 `keyframeImageUrls: string[]`,v1 只用首末两个);bff 复用 `resolveImageUrl` 解析。
  - provider 层:给支持关键帧的 provider(Kling 首尾帧、Luma keyframes)加"首帧+末帧"入参;`ProviderOption` 增 `keyframes: { supported, max }` 能力位,面板据此决定 A 是否可选。
- 一组图 → 一条 clip:首图=首帧、末图=末帧;`sourceImageRef` = 首图。
- 提示词:整段运动一条(多图 Prompt Assist 产出)。

**Prompt Assist 多图化(两模式共用)**
- 现 `/api/prompt-assist` 单图 → 扩为吃**多图**(有序)。server 把多张 inline 一起喂 Gemini,指令随模式("整段运动" vs "统一运镜")产出一条正文。bff `/bff/clip-prompt-assist` 请求体 `imageUrl` → `imageUrls: string[]`(或加复数字段,单图保后兼容)。

- 单图路径不变;组不含图片时不出组合面板。

## 分期(每步独立可验证)

1. **库层 group 原语**(已完成):数据模型 + `groups.ts` 纯函数 + store + 持久化回填 + split/paste 维护 + 单测。
2. **库层交互**(已完成):Cmd+G/Cmd+Shift+G + 右键菜单 + 组包围盒轮廓 + 命令面 + i18n。
3. **v2 · B 批量按序(默认)**:组合面板 + 模式切换(先只有 B)+ 每图各生成一条(复用单图链路,保序)+ **多图 Prompt Assist**(server/bff/前端)。附:把已落地的 hero+参考图 `ClipGroupGenerate` **改造**为 B。
4. **v2 · A 首尾帧进阶**:server/bff/provider 加**关键帧通道**(`start/endImageUrl` + provider `keyframes` 能力位,Kling/Luma)+ 面板 A 模式(仅支持的 provider 可选)+ A 的整段运动提示词。

## 明确不做(后置)

- 整组包围盒**缩放/旋转**(需新变换数学 + 旋转手柄)。
- 组命名 / 嵌套组 / 组级统一 fade/时间行为。
- **A 的多关键帧(>2)**:v1 只做首尾两帧。
- B 的**逐张提示词**:v1 先共用一条,逐张后配。
