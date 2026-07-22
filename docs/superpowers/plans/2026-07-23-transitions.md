# 转场(Transitions)v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `@gedatou/shared`/`@gedatou/editor` 加**交叉淡化转场 v1**:两个同轨相邻片段之间建转场 → 入场片段真实左移形成重叠 → 重叠区 A 淡出/B 淡入(渲染自愈到 live 重叠);时间线切点 `+` 建、pill 拖拽调时长、Delete 删;进 undo/持久化,预览与服务端渲染同源,不破坏既有功能。

**Architecture(评审决定,否决 TransitionSeries):** 转场 = 两片段的**重叠区 + 逐帧透明度乘子**,复用现有独立 `<Sequence>` 渲染器,零新渲染范式、不加依赖。纯函数 `getTransitionRenderProps(state,item,absFrame):{opacity}`(shared)乘进 `ItemPositioner` 的 opacity;`ordering` 每轨按 from 升序保证入场片段在上。数据 `UndoableState.transitions: Record<id,Transition>`,建转场把 B.from 左移、`calcDuration` 天然缩短、v1 不 ripple(留诚实空档)。编辑侧 `transition-ops`(imperative store)+ 临时 `selectedTransitionId` + 时间线切点 UX + 薄检查器面板。

**Tech Stack:** pnpm monorepo · React19 + Zustand vanilla store · Remotion 4.0.491(`interpolate`)· vitest · tsup。

## Global Constraints

- **帧基准(唯一易错处)**:`ItemPositioner` 里 `frame = useCurrentFrame()` 是 **Sequence 内相对帧**(0 = item.from)。`getTransitionRenderProps` 一律按**合成绝对帧**推理,调用方必须传 `item.from + frame`。重叠窗口(绝对帧)= `[toItem.from, toItem.from + d]`(== `[fromItem.end − d, fromItem.end]`)。
- **live 重叠自愈**:渲染每帧按两片段**当前** from/dur 重算 `liveOverlap = fromItem.from + fromItem.durationInFrames − toItem.from`;`d = min(transition.durationInFrames, liveOverlap)`;`d ≤ 0` → 该转场对本 item no-op。**存储时长从不被盲信。**
- **shared 渲染码保持框架纯**:`@gedatou/shared/composition/*` 不 import `@gedatou/editor`、无 `@/`、无 zustand/router(进服务端渲染 bundle)。`interpolate` 从 `'remotion'`(peer)。
- **预览=服务端**:都走同一 `MainComposition`/`ItemPositioner`,按构造一致。
- **稀疏/兼容**:`transitions` 顶层键,旧档 `?? {}` load-shim;不加任何 BaseItem 字段;`getTransitionRenderProps` 内 `state.transitions` 缺失时提前 `{opacity:1}`(防未 shim 的 host-injected 路径)。
- **不变量**:同轨;建/调时 `toItem.from === fromItem.from + fromItem.durationInFrames − durationInFrames`;每 item 至多被一个转场引用为 from、至多一个为 to。
- **v1 只做 fade**;`type` 单成员联合(v2 加 slide/wipe 零迁移);`{opacity}` 对象 seam 为 v2 留 transform/clipPath 口。
- **commit 语义**:离散(建/删)`commit:true`;pill 拖拽 `commit:false` 流 + `commitPending()`。

## Verification Recipe

- 聚焦:`pnpm -F @gedatou/shared test <file>` / `pnpm -F @gedatou/editor test <file>`
- 类型:`pnpm -F @gedatou/shared typecheck` / `pnpm -F @gedatou/editor typecheck`(或 `pnpm -r --parallel typecheck` → 0)
- 全量:`pnpm -r --parallel test`(基线 shared 32 + editor 63 + 新增)
- UI/渲染任务额外:`pnpm --filter "@gedatou/*" build` 成功。浏览器冒烟由控制器统一做。

## File Structure

```
packages/shared/src/
  types.ts                       += TransitionType/Transition + UndoableState.transitions          (T1)
  factories.ts                   += createEmptyState transitions:{}                                 (T1)
  composition/transitions.ts NEW getTransitionRenderProps (+ test)                                  (T2)
  composition/ItemRenderer.tsx   EDIT ItemPositioner opacity 乘 getTransitionRenderProps            (T2)
  composition/ordering.ts        EDIT 每轨 sort by from (+ test)                                     (T3)
packages/editor/src/
  persistence/persistence.ts     EDIT deserializeState load-shim transitions ??= {}                 (T1)
  state/store.ts                 EDIT selectedTransitionId 字段/setter(临时) + setSelected 互斥 + deleteSelected 孤儿清理  (T4)
  lib/transition-ops.ts     NEW  addTransition/applyTransitionDuration/removeTransition (+ test)     (T4)
  index.ts                       EDIT 导出转场命令 + 类型                                            (T4)
  timeline/TimelinePanel.tsx     EDIT 切点 '+' 徽章 / pill / 拖拽调时长 / 点选                       (T5)
  inspector/Inspector.tsx        EDIT selectedTransitionId 分支 → TransitionPanel                    (T6)
  shortcuts/useShortcuts.ts      EDIT Delete 删转场 / Escape 清选                                    (T6)
```

---

## Task 1: 数据模型 + 状态初始化/迁移(shared + editor persistence)

**Files:** Modify `packages/shared/src/types.ts`(:157-166 UndoableState);`packages/shared/src/factories.ts`(:101-109 createEmptyState);`packages/editor/src/persistence/persistence.ts`(:18-27 deserializeState)

**Interfaces:** Produces `TransitionType`、`Transition`、`UndoableState.transitions`;经 `shared/src/index.ts` `export * from './types'` 对外。

- [ ] **Step 1: 加类型** — `types.ts`,在 UndoableState 之前:

```ts
export type TransitionType = 'fade'; // 单成员联合;v2 加 'slide'|'wipe'… 零迁移
export type Transition = {
  id: string;
  trackId: string;
  fromItemId: string; // 出场(A)
  toItemId: string;   // 入场(B)
  type: TransitionType;
  durationInFrames: number;
};
```
UndoableState 加字段:`transitions: Record<string, Transition>;`

- [ ] **Step 2: createEmptyState** — `factories.ts:101-109` 返回对象加 `transitions: {},`。

- [ ] **Step 3: load-shim** — `persistence.ts` deserializeState,在 `normalizeLegacyFades(...)` 之后加 `parsed.transitions ??= {};`(旧档兼容)。

- [ ] **Step 4: 验证** — `pnpm -r --parallel typecheck`(0);`pnpm -r --parallel test`(基线绿)。

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/types.ts packages/shared/src/factories.ts packages/editor/src/persistence/persistence.ts
git commit -m "$(cat <<'EOF'
feat(transitions): data model + state init/load-shim

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 渲染纯函数 + 接入 ItemPositioner(shared,TDD)

**Files:** Create `packages/shared/src/composition/transitions.ts` + `transitions.test.ts`;Modify `packages/shared/src/composition/ItemRenderer.tsx`(:116)

**Interfaces:** Produces `getTransitionRenderProps(state, item, absFrame): { opacity: number }`。Consumes `interpolate`(remotion)、类型(../types)。

- [ ] **Step 1: 写失败测试** — `transitions.test.ts`(用 `createSolidItem`/`createEmptyState` 手搭状态):

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyState, createSolidItem } from '../factories';
import type { Transition, UndoableState } from '../types';
import { getTransitionRenderProps } from './transitions';

// A: from 0 dur 60;B: from 45 dur 60(重叠 15,fade 15)
const mk = (): UndoableState => {
  const s = createEmptyState({ width: 100, height: 100 });
  const a = { ...createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 }), id: 'A', durationInFrames: 60 };
  const b = { ...createSolidItem({ trackId: 't', from: 45, width: 10, height: 10 }), id: 'B', durationInFrames: 60 };
  const t: Transition = { id: 'x', trackId: 't', fromItemId: 'A', toItemId: 'B', type: 'fade', durationInFrames: 15 };
  return { ...s, items: { A: a, B: b }, transitions: { x: t } };
};

describe('getTransitionRenderProps', () => {
  it('无转场提前返回 1', () => {
    const s = createEmptyState({ width: 100, height: 100 });
    const it = createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 });
    expect(getTransitionRenderProps({ ...s, items: { [it.id]: it } }, it, 0).opacity).toBe(1);
  });
  it('入场 B 在重叠 [45,60] 内 0→1', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.B, 45).opacity).toBeCloseTo(0);
    expect(getTransitionRenderProps(s, s.items.B, 60).opacity).toBeCloseTo(1);
    expect(getTransitionRenderProps(s, s.items.B, 52.5).opacity).toBeCloseTo(0.5);
  });
  it('出场 A 在重叠 [45,60] 内 1→0', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.A, 45).opacity).toBeCloseTo(1);
    expect(getTransitionRenderProps(s, s.items.A, 60).opacity).toBeCloseTo(0);
  });
  it('重叠区外为 1', () => {
    const s = mk();
    expect(getTransitionRenderProps(s, s.items.A, 10).opacity).toBe(1); // A 前段
    expect(getTransitionRenderProps(s, s.items.B, 100).opacity).toBe(1); // B 后段
  });
  it('live 自愈:B 右移到无重叠 → no-op(1)', () => {
    const s = mk();
    s.items.B = { ...s.items.B, from: 60 }; // 不再重叠
    expect(getTransitionRenderProps(s, s.items.B, 60).opacity).toBe(1);
  });
  it('mid-chain:B 既是某转场 to 又是另一转场 from → 淡入×淡出相乘', () => {
    const s = mk();
    const c = { ...createSolidItem({ trackId: 't', from: 105, width: 10, height: 10 }), id: 'C', durationInFrames: 60 };
    // B(45..105) 与 C 建第二个转场:C.from 左移到 90,重叠 [90,105] 15 帧
    s.items.C = { ...c, from: 90 };
    s.transitions.y = { id: 'y', trackId: 't', fromItemId: 'B', toItemId: 'C', type: 'fade', durationInFrames: 15 };
    // 在 B 的出场窗口中点附近,B 已淡入完成(=1)、正在淡出
    expect(getTransitionRenderProps(s, s.items.B, 97.5).opacity).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm -F @gedatou/shared test src/composition/transitions.test.ts`;FAIL(模块缺失)。

- [ ] **Step 3: 写实现** — `transitions.ts`:

```ts
import { interpolate } from 'remotion';
import type { EditorStarterItem, UndoableState } from '../types';

/** item 在某帧因转场获得的乘子。absFrame = 合成绝对帧(调用方传 item.from + useCurrentFrame())。 */
export const getTransitionRenderProps = (
  state: UndoableState,
  item: EditorStarterItem,
  absFrame: number,
): { opacity: number } => {
  const transitions = state.transitions;
  if (!transitions) return { opacity: 1 };
  let opacity = 1;
  for (const t of Object.values(transitions)) {
    const isFrom = t.fromItemId === item.id;
    const isTo = t.toItemId === item.id;
    if (!isFrom && !isTo) continue;
    const from = state.items[t.fromItemId];
    const to = state.items[t.toItemId];
    if (!from || !to) continue; // 孤儿安全
    const liveOverlap = from.from + from.durationInFrames - to.from;
    const d = Math.min(t.durationInFrames, liveOverlap);
    if (d <= 0) continue;
    const start = to.from; // 绝对帧
    const end = to.from + d;
    if (isTo) opacity *= interpolate(absFrame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    if (isFrom) opacity *= interpolate(absFrame, [start, end], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  }
  return { opacity };
};
```

- [ ] **Step 4: 跑测试确认通过** — 同 Step 2 命令;PASS。

- [ ] **Step 5: 接入 ItemPositioner** — `ItemRenderer.tsx` 顶部 import `getTransitionRenderProps` from `'./transitions'`;把 :116 的 opacity 改为:

```tsx
opacity: baseOpacity * fadeIn * fadeOut * getTransitionRenderProps(ctx.state, item, item.from + frame).opacity,
```
> `frame = useCurrentFrame()` 是 item-local,`item.from + frame` = 绝对帧。`ctx.state` 已在作用域(RenderContext)。无转场时函数提前返回 1 → 零行为变化。

- [ ] **Step 6: 验证** — shared typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功(渲染 bundle 编译)。

- [ ] **Step 7: 导出**(可选)— 若 editor 需引用 `getTransitionRenderProps`(本 v1 不需要,渲染在 shared 内),可暂不导出;至少确保 `transitions.ts` 被 `composition/index.ts` 导出以备用:加 `export * from './transitions';`。

- [ ] **Step 8: Commit**
```bash
git add packages/shared/src/composition/transitions.ts packages/shared/src/composition/transitions.test.ts packages/shared/src/composition/ItemRenderer.tsx packages/shared/src/composition/index.ts
git commit -m "$(cat <<'EOF'
feat(transitions): getTransitionRenderProps crossfade + ItemPositioner wire

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 每轨按 from 排序(z 序修正,shared,+test)

**Files:** Modify `packages/shared/src/composition/ordering.ts`(:12-14);Modify/Add `ordering.test.ts`

**Interfaces:** `getOrderedItems` 行为:同轨内按 `from` 升序(后开始者在数组后 → 画在上)。

- [ ] **Step 1: 加断言测试** — 在 `ordering.test.ts` 追加:同一轨两 item(from 5 与 from 0),`getOrderedItems` 里 from 0 在前、from 5 在后(后者绘制在上)。

- [ ] **Step 2: 改 ordering.ts** — 把 :12-14 的 push 循环改为先收集本轨 items 再排序:

```ts
    const trackItems = Object.values(state.items).filter((it) => it.trackId === track.id);
    trackItems.sort((x, y) => x.from - y.from);
    for (const item of trackItems) result.push(item);
```

- [ ] **Step 3: 验证** — `pnpm -F @gedatou/shared test src/composition/ordering.test.ts`(既有跨轨断言 + 新断言全绿);`pnpm -r --parallel typecheck` 0。

- [ ] **Step 4: Commit**
```bash
git add packages/shared/src/composition/ordering.ts packages/shared/src/composition/ordering.test.ts
git commit -m "$(cat <<'EOF'
feat(transitions): order same-track items by from for crossfade z-order

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 编辑侧命令 + 选择状态 + 孤儿清理(editor,TDD)

**Files:** Create `packages/editor/src/lib/transition-ops.ts` + `transition-ops.test.ts`;Modify `packages/editor/src/state/store.ts`(选择字段 + deleteSelected);Modify `packages/editor/src/index.ts`

**Interfaces:** Produces `addTransition(store, fromItemId, toItemId): string`(返回新 id)、`applyTransitionDuration(store, id, dur, commit?)`、`removeTransition(store, id)`;store 新增 `selectedTransitionId: string | null` + `setSelectedTransition(id)`。

- [ ] **Step 1: store 选择字段** — `store.ts`:仿 `itemSelectedForCrop`(:76-77 声明 / :200-201 impl)加:
  - 声明:`selectedTransitionId: string | null;` `setSelectedTransition: (id: string | null) => void;`
  - init(:130 附近):`selectedTransitionId: null,`
  - impl:`setSelectedTransition: (id) => set({ selectedTransitionId: id, selectedItemIds: [] }),`
  - **互斥**:`setSelected`(:169)改为 `set({ selectedItemIds: ids, selectedTransitionId: null })`。

- [ ] **Step 2: deleteSelected 孤儿清理** — `store.ts:245-267` 的 updateUndoable updater 里,在 return 前算:
```ts
    const transitions = Object.fromEntries(
      Object.entries(s.transitions).filter(([, t]) => !selectedItemIds.includes(t.fromItemId) && !selectedItemIds.includes(t.toItemId)),
    );
    return { ...s, items, deletedAssets, transitions };
```

- [ ] **Step 3: 写失败测试** — `transition-ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSolidItem } from '@gedatou/shared';
import { createEditorStore } from '../state/store';
import { addTransition, applyTransitionDuration, removeTransition } from './transition-ops';

const mk = () => {
  const store = createEditorStore();
  const a = { ...createSolidItem({ trackId: 't', from: 0, width: 10, height: 10 }), id: 'A', durationInFrames: 60 };
  const b = { ...createSolidItem({ trackId: 't', from: 60, width: 10, height: 10 }), id: 'B', durationInFrames: 60 };
  store.getState().updateUndoable((s) => ({ ...s, items: { A: a, B: b } }));
  return { store, get: () => store.getState().undoable };
};

describe('transition-ops', () => {
  it('add:B 左移 dur、插记录、单 undo、选中', () => {
    const { store, get } = mk();
    const past0 = store.getState().past.length;
    const id = addTransition(store, 'A', 'B');
    const t = get().transitions[id];
    expect(t).toMatchObject({ fromItemId: 'A', toItemId: 'B', type: 'fade' });
    expect(get().items.B.from).toBe(60 - t.durationInFrames); // 左移
    expect(store.getState().past.length).toBe(past0 + 1);
    expect(store.getState().selectedTransitionId).toBe(id);
  });
  it('applyDuration:clamp [1,min(aDur,bDur)] 且重算 B.from', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    applyTransitionDuration(store, id, 999);
    expect(get().transitions[id].durationInFrames).toBe(60); // clamp 到 min(60,60)
    expect(get().items.B.from).toBe(0); // A.end(60) - 60
  });
  it('remove:删记录、B 不动(硬切)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    const bFrom = get().items.B.from;
    removeTransition(store, id);
    expect(get().transitions[id]).toBeUndefined();
    expect(get().items.B.from).toBe(bFrom);
  });
  it('删 item 连带删转场(孤儿清理)', () => {
    const { store, get } = mk();
    const id = addTransition(store, 'A', 'B');
    store.getState().setSelected(['A']);
    store.getState().deleteSelected();
    expect(get().transitions[id]).toBeUndefined();
    expect(get().items.A).toBeUndefined();
  });
});
```

- [ ] **Step 4: 跑测试确认失败** — `pnpm -F @gedatou/editor test src/lib/transition-ops.test.ts`;FAIL。

- [ ] **Step 5: 写实现** — `transition-ops.ts`:

```ts
import type { Transition } from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';

const DEFAULT_TRANSITION_FRAMES = 12;
// 复用仓库现有 id 生成器(grep createSolidItem 看 item.id 怎么来的,用同一个);占位:
const newId = (): string => `tr-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

const clampDur = (dur: number, aDur: number, bDur: number): number =>
  Math.max(1, Math.min(Math.round(dur), aDur, bDur));

/** 建转场:B 左移 dur 形成重叠,插记录,单 undo,选中;返回 id */
export const addTransition = (store: EditorStoreApi, fromItemId: string, toItemId: string): string => {
  const id = newId();
  store.getState().updateUndoable((s) => {
    const a = s.items[fromItemId];
    const b = s.items[toItemId];
    if (!a || !b) return s;
    const dur = clampDur(DEFAULT_TRANSITION_FRAMES, a.durationInFrames, b.durationInFrames);
    const t: Transition = { id, trackId: a.trackId, fromItemId, toItemId, type: 'fade', durationInFrames: dur };
    return {
      ...s,
      items: { ...s.items, [toItemId]: { ...b, from: a.from + a.durationInFrames - dur } },
      transitions: { ...s.transitions, [id]: t },
    };
  }, { commit: true });
  store.getState().setSelectedTransition(id);
  return id;
};

/** 调时长:clamp,并据当前 A.end 重算 B.from(维持 overlap=dur) */
export const applyTransitionDuration = (store: EditorStoreApi, id: string, dur: number, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id];
    if (!t) return s;
    const a = s.items[t.fromItemId];
    const b = s.items[t.toItemId];
    if (!a || !b) return s;
    const clamped = clampDur(dur, a.durationInFrames, b.durationInFrames);
    if (clamped === t.durationInFrames && b.from === a.from + a.durationInFrames - clamped) return s; // no-op 守卫
    return {
      ...s,
      items: { ...s.items, [t.toItemId]: { ...b, from: a.from + a.durationInFrames - clamped } },
      transitions: { ...s.transitions, [id]: { ...t, durationInFrames: clamped } },
    };
  }, { commit });
};

/** 删转场:B 不动(变硬切) */
export const removeTransition = (store: EditorStoreApi, id: string): void => {
  store.getState().updateUndoable((s) => {
    if (!s.transitions[id]) return s;
    const rest = { ...s.transitions };
    delete rest[id];
    return { ...s, transitions: rest };
  }, { commit: true });
  if (store.getState().selectedTransitionId === id) store.getState().setSelectedTransition(null);
};
```
> **id 生成**:把 `newId` 换成仓库实际用的那个(grep `createSolidItem` 看 item.id 的生成来源,统一)。`EditorStoreApi` 从 `../state/store` 导入(公开类型)。

- [ ] **Step 6: 跑测试确认通过** — 同 Step 4;PASS。

- [ ] **Step 7: 导出** — `index.ts` 加:
```ts
export { addTransition, applyTransitionDuration, removeTransition } from './lib/transition-ops';
export type { Transition, TransitionType } from '@gedatou/shared';
```

- [ ] **Step 8: 验证** — `pnpm -r --parallel typecheck` 0;`pnpm -r --parallel test` 全绿。

- [ ] **Step 9: Commit**
```bash
git add packages/editor/src/lib/transition-ops.ts packages/editor/src/lib/transition-ops.test.ts packages/editor/src/state/store.ts packages/editor/src/index.ts
git commit -m "$(cat <<'EOF'
feat(transitions): store commands + selection + orphan cleanup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 时间线切点 UX(TimelinePanel)

**Files:** Modify `packages/editor/src/timeline/TimelinePanel.tsx`(:697-710 相邻区 + 拖拽机制)

**Interfaces:** Consumes `addTransition`/`applyTransitionDuration`(`../lib/transition-ops`)、`useEditor`/`useEditorApi`、`zoom`、`state.transitions`。

- [ ] **Step 1: '+' 徽章(建转场)** — 在 :697-710 的相邻 `flatMap` 里,对每个相邻对 `(a, b)`(`b.from === a.from + a.durationInFrames`),**且该对无转场**(`!Object.values(transitions).some(t => t.fromItemId===a.id && t.toItemId===b.id)`)时,渲染一个悬停可见的 `+` 徽章(anchor `left: b.from * zoom`,z-40/z-45),`onClick` = `addTransition(api, a.id, b.id)`。

- [ ] **Step 2: pill(已存转场)** — **另起**一个 map 遍历本轨 `transitions`(`Object.values(state.transitions).filter(t => t.trackId === track.id)`):对每个转场,取 `a=items[fromItemId]`、`b=items[toItemId]`,重叠区 = `[b.from, a.from+a.durationInFrames]`,渲染实心 pill:`left: b.from * zoom`,`width: (a.from + a.durationInFrames - b.from) * zoom`(= liveOverlap*zoom),z-40。`onPointerDown`(非拖拽点击)选中:`setSelectedTransition(t.id)`;附一个可拖拽边缘调时长。

- [ ] **Step 3: 拖拽调时长** — 复用 `ItemBlock.tsx:149-168` 的 `startHandleDrag` 或本文件 roll 拖拽(:509-559,pointer-capture + commit:false + commitPending)。拖拽 pill 左缘(= b.from)左移 = 增大 overlap:`newDur = round((a.from + a.durationInFrames) - frameAtPointer)`,`applyTransitionDuration(api, t.id, newDur, false)`;松手 `commitPending()`。夹在 op 内已做([1,min(aDur,bDur)])。**`e.stopPropagation()`** 防触发块 move / roll。

- [ ] **Step 4: z 序共存** — pill 放 z-40/z-45,与 roll 热区(:705,w-1 2px)共存:pill 占中段、roll 占极窄边缘;确保 pill 的 pointerdown `stopPropagation`。

- [ ] **Step 5: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。(浏览器冒烟控制器做。)

- [ ] **Step 6: Commit**
```bash
git add packages/editor/src/timeline/TimelinePanel.tsx
git commit -m "$(cat <<'EOF'
feat(transitions): timeline cut affordance — add badge, resize pill, select

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 检查器面板 + 快捷键(editor)

**Files:** Modify `packages/editor/src/inspector/Inspector.tsx`(:783-807 分支);Modify `packages/editor/src/shortcuts/useShortcuts.ts`(:63-73)

**Interfaces:** Consumes `selectedTransitionId`、`applyTransitionDuration`/`removeTransition`、`useEditor`/`useEditorApi`、字段原语(`NumberField`/`Section`/`Row`)。

- [ ] **Step 1: TransitionPanel** — 在 `Inspector.tsx` 加一个薄组件:
```tsx
const TransitionPanel: React.FC<{ id: string }> = ({ id }) => {
  const api = useEditorApi();
  const t = useEditor((s) => s.undoable.transitions[id]);
  if (!t) return null;
  return (
    <Section title="Transition">
      <Row label="Type"><span className="text-xs text-muted-foreground">Cross Dissolve</span></Row>
      <Row label="Duration">
        <NumberField inline label="" value={t.durationInFrames}
          onChange={(v, c) => applyTransitionDuration(api, id, v, c)} />
      </Row>
      <Button size="sm" variant="ghost" onClick={() => removeTransition(api, id)}>Remove</Button>
    </Section>
  );
};
```
> `NumberField` 的 `onChange(v, committing)`:拖 scrub 传 committing=false;字段 onChange 直接调 `applyTransitionDuration`(它内部 clamp + 重算 B.from,与时间线 pill 用同一 op,永不打架)。确认 `Section`/`Row`/`NumberField`/`Button` 的导入路径(`./fields`、`./NumberField`、`../components/ui/button` 或现有)。

- [ ] **Step 2: 分支接入** — `Inspector.tsx:783-807`:读 `const selectedTransitionId = useEditor((s) => s.selectedTransitionId);`,在 item/composition 判断**之前**加:`if (selectedTransitionId) content = <TransitionPanel id={selectedTransitionId} />;`(互斥已由 store 保证)。

- [ ] **Step 3: 快捷键** — `useShortcuts.ts:63-67` Delete/Backspace 分支改为:`const st = store; if (st.selectedTransitionId) { removeTransition(editorApi, st.selectedTransitionId); return; }` 再走原 `deleteSelected()`。Escape(:68-73)加清 `setSelectedTransition(null)`。

- [ ] **Step 4: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。

- [ ] **Step 5: Commit**
```bash
git add packages/editor/src/inspector/Inspector.tsx packages/editor/src/shortcuts/useShortcuts.ts
git commit -m "$(cat <<'EOF'
feat(transitions): inspector panel + delete/escape shortcuts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成判据

- `pnpm -r --parallel typecheck` 0;`pnpm -r --parallel test` 全绿(基线 + transitions/transition-ops/ordering 新测);`pnpm --filter "@gedatou/*" build` 成功。
- 两同轨相邻片段切点悬停出 `+` → 点建转场:B 左移形成重叠、pill 显示、渲染交叉淡化(重叠区 A 淡出 B 淡入);拖 pill 调时长;点 pill 选中 → 检查器薄面板改时长/移除;Delete 删。
- 渲染(预览 + 服务端)重叠区正确交叉淡化;后续 trim/move A/B → 渲染自愈到 live 重叠(不"对着空气淡")。
- undo/redo 覆盖建/调/删;删 item 连带删其转场;刷新/存档保留转场。
- 未破坏:自由排布/重叠/gap、既有 fade 手柄、keyframes、多轨合成、既有时间线手势(z 序 + stopPropagation 隔离)。

## 控制器负责的浏览器/渲染验证

- demo(apps/editor :5173)冒烟:两片段相邻 → 建转场 → 预览看交叉淡化;拖 pill;检查器改时长/移除;Delete;undo/redo;trim A 看渲染自愈。
- 抽帧核对重叠区 A/B opacity 曲线与 `getTransitionRenderProps` 一致;确认服务端渲染同源。
```
