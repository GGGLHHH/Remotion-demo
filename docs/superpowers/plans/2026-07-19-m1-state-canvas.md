# M1：状态层（撤销/重做）+ 画布交互 + Inspector 通用属性 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。步骤用 checkbox 跟踪。

**Goal:** Zustand 状态层（快照式撤销/重做 + commitToUndoStack 语义）、画布选择/拖拽/缩放交互、Inspector 通用属性面板。验收：画布上摆放、变换元素，可撤销。

**规格来源:** specs/2026-07-19-remotion-editor-design.md §4 §5.1 §5.3、M1 验收

## Global Constraints

- 撤销栈上限 `MAX_UNDO_STACK_SIZE = 50`；只有 `undoableState` 进栈
- 高频操作（拖拽/手柄缩放）不逐帧提交快照，松手时一次提交
- 引用不变 ⇒ 不产生新快照
- 合成坐标系为真源；屏幕坐标 = 合成坐标 × scale
- 交互代码禁止进入 shared（渲染纯净性）

---

### Task 1: Zustand store + 撤销/重做（TDD）

**Files:** `apps/editor/src/state/store.ts`；Test: `apps/editor/src/state/__tests__/history.test.ts`（editor 加 vitest）

**Interfaces (Produces):**
```ts
export type EditorStore = {
  undoable: UndoableState;
  past: UndoableState[];       // 最近的在末尾
  future: UndoableState[];
  selectedItemIds: string[];
  /** commit=true（默认）：先把当前快照推入 past 再应用；commit=false：应用但记住首次变更前的基线 */
  updateUndoable: (updater: (s: UndoableState) => UndoableState, opts?: { commit?: boolean }) => void;
  /** 把 pending 基线提交为一条撤销记录（拖拽松手时调用） */
  commitPending: () => void;
  undo: () => void;
  redo: () => void;
  setSelected: (ids: string[]) => void;
  deleteSelected: () => void;
};
export const useEditorStore: UseBoundStore<StoreApi<EditorStore>>;
```

**测试用例（全部先写、先红后绿）:**
1. commit 更新推入 past、清空 future；undo 回滚、redo 重做
2. updater 返回原引用 ⇒ 不入栈不变更
3. 连续 commit:false 更新 + commitPending ⇒ 仅一条撤销记录，undo 一步回到拖拽前
4. commitPending 在无 pending 时是 no-op
5. past 超过 50 丢弃最旧
6. deleteSelected 移除 items 并清空选中（一条撤销记录）

- [ ] 写测试 → 红 → 实现 → 绿 → `git commit -m "feat(editor): zustand store with snapshot undo/redo"`

### Task 2: 画布几何（纯函数，TDD）

**Files:** `apps/editor/src/canvas/geometry.ts`；Test: `apps/editor/src/canvas/__tests__/geometry.test.ts`

**Interfaces (Produces):**
```ts
export type Rect = { left: number; top: number; width: number; height: number };
/** 点是否命中（考虑 rotation，角度制，绕矩形中心） */
export const hitTest: (rect: Rect, rotationDeg: number, px: number, py: number) => boolean;
/** 当前帧可见且可命中的最上层 item（getOrderedItems 逆序找） */
export const topmostItemAt: (state: UndoableState, frame: number, px: number, py: number) => EditorStarterItem | null;
/** 8 向手柄缩放：返回新 rect；corner 保持宽高比，edge 单轴；最小尺寸 20 */
export const resizeRect: (start: Rect, handle: 'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se', dx: number, dy: number, keepAspect: boolean) => Rect;
```

**测试用例:** 未旋转命中/未命中；旋转 90° 命中翻转点；上层轨道优先命中；时间范围外不命中；隐藏轨道不命中；`se` 角等比缩放；`e` 边单轴；最小尺寸钳制。

- [ ] 写测试 → 红 → 实现 → 绿 → `git commit -m "feat(editor): canvas geometry helpers"`

### Task 3: 画布交互层 + 缩放

**Files:** `apps/editor/src/canvas/CanvasView.tsx`, `apps/editor/src/canvas/SelectionOverlay.tsx`；Modify: `apps/editor/src/App.tsx`（demo state 改为 store 初始值、画布区换 CanvasView）

行为（对齐官方）：
- 适配缩放：默认 fit（按容器计算 scale），`Cmd/Ctrl+滚轮` 缩放、`+`/`-`/`0` 快捷键、右上角百分比显示 + fit 重置按钮
- 点选（蓝描边 + 8 手柄）、`Shift/Cmd+点击` 加选、点空白清空选择
- 拖动移动（多选联动，commit:false，松手 commitPending；`Shift` 锁定主轴）
- 手柄缩放（角=等比、边=单轴，实时 commit:false，松手提交）
- 命中判定用 Player 当前帧（`frameupdate` 事件维护）
- `Delete/Backspace` 删除选中；`Esc` 清空选择；`Cmd/Ctrl+Z / Y / Shift+Z` 撤销重做（输入框聚焦时不触发）
- 顶栏撤销/重做按钮（可用态跟随栈）

验证：Playwright 截图脚本手动驱动（点选出现描边 → 拖动位置变化 → Cmd+Z 回原位），无页面错误。

- [ ] 实现 → 视觉验证 → `git commit -m "feat(editor): canvas selection, drag, resize and zoom"`

### Task 4: Inspector 通用属性面板

**Files:** `apps/editor/src/inspector/Inspector.tsx`, `apps/editor/src/inspector/NumberField.tsx`；Modify: `App.tsx`

- 未选中：显示合成宽高（只读输入 + 交换尺寸按钮，写 store）
- 单选：X/Y/宽/高/旋转/不透明度(0-100%)/圆角 数字输入（Enter/blur 提交，一次一条撤销记录）
- 多选：显示“已选 N 项”
- 文本项额外露出 text 内容编辑（完整文本面板在 M4）

验证：改 X 值画布即时移动、可撤销；交换尺寸后 Player 比例变化。

- [ ] 实现 → 视觉验证 → `git commit -m "feat(editor): inspector with common item properties"`

## Self-Review

- §4 状态两层结构、commit 语义、栈上限 → Task 1；§5.1 选择/拖拽/缩放手柄/画布缩放 → Task 2/3；§5.3 通用属性 → Task 4。
- M1 不含：框选 marquee、吸附辅助线、右键菜单、复制粘贴（M4 画布补全批次）、旋转手柄拖拽（M4，本期 Inspector 数字输入可改旋转）。
- 类型一致性：store 接口与 shared `UndoableState` 对齐；geometry 只依赖 shared 类型。
