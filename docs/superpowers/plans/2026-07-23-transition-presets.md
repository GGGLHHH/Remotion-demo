# 转场预设 v2(Slide/Wipe/Zoom)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。步骤用 checkbox。

**Goal:** 转场从单一 fade 富化为 fade + Slide(4 向)+ Wipe(4 向)+ Zoom(in/out),检查器做成预设菜单;全部在 v1 的 per-item 渲染 seam 上做,零迁移。

**Architecture:** `getTransitionRenderProps` 返回从 `{opacity}` 扩为 `{opacity, translate?, scale?, clipPath?}`,`ItemPositioner` 用 CSS 独立变换属性铺(与既有 `rotate` 自动合成)。预设是 (type,direction) 组合,一张 shared 表驱动渲染与检查器。

**Tech Stack:** React19 · Remotion 4.0.491 · `interpolate` · zustand · vitest · pnpm。检查器 `Popover`(复用 AnimationSection 写法)。

## Global Constraints

- **零迁移**:`TransitionType` 加宽('fade' 仍合法)、`Transition.direction` 可选;旧数据(全 fade、无 direction)渲染字节不变。
- **fade 路径不回归**:refactor 后 fade 的 opacity 曲线与 v1 完全一致(入场 p、出场 1-p),translate/scale/clipPath 均 undefined。
- **建转场 UX 不变**:seam-click 仍建默认 fade;换预设在检查器。
- **no-op 守卫**:`applyTransitionPreset` type+direction 未变则返回原引用。
- 纯函数、双端同源(预览=服务端)。additive/局部,不破坏既有区/命令/测试。

## Verification Recipe
`pnpm -r --parallel typecheck`(0)· `pnpm -r --parallel test`(基线 shared 39 + editor 67,本 plan 净增测试后全绿)· `pnpm --filter "@gedatou/*" build`(成功)。浏览器逐类型目检由控制器做。

## File Structure
```
packages/shared/src/
  types.ts                          EDIT  TransitionType 加宽 + TransitionDirection + Transition.direction   (T1)
  composition/transition-presets.ts NEW   TRANSITION_PRESETS + TransitionPreset + presetIdOf (+test)          (T1)
  composition/transitions.ts        EDIT  getTransitionRenderProps 扩返回 + transitionVisual 纯函数 (+test)   (T2)
  composition/ItemRenderer.tsx      EDIT  ItemPositioner 铺 translate/scale/clipPath                          (T2)
  index.ts                          EDIT  导出新类型/预设表                                                    (T2/T4)
packages/editor/src/
  lib/transition-ops.ts             EDIT  applyTransitionPreset (+test)                                       (T3)
  inspector/Inspector.tsx           EDIT  TransitionPanel 预设菜单(Popover)                                  (T4)
  index.ts                          EDIT  导出 applyTransitionPreset                                          (T4)
```

---

## Task 1: 数据模型 + 预设表

**Files:** Modify `packages/shared/src/types.ts`;Create `packages/shared/src/composition/transition-presets.ts` + `packages/shared/src/composition/__tests__` 或同目录 `transition-presets.test.ts`。

**Interfaces produced:** `TransitionType`、`TransitionDirection`、`Transition.direction?`、`TransitionPreset`、`TRANSITION_PRESETS`、`presetIdOf`。

- [ ] **Step 1: types.ts** — 找到 `export type TransitionType = 'fade';` 与 `Transition`,改为:
```ts
export type TransitionType = 'fade' | 'slide' | 'wipe' | 'zoom';
export type TransitionDirection = 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
export type Transition = {
  id: string;
  trackId: string;
  fromItemId: string;
  toItemId: string;
  type: TransitionType;
  direction?: TransitionDirection;
  durationInFrames: number;
};
```

- [ ] **Step 2: transition-presets.ts** —
```ts
import type { TransitionType, TransitionDirection, Transition } from '../types';

export type TransitionPreset = { id: string; type: TransitionType; direction?: TransitionDirection; label: string };

export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
  { id: 'fade', type: 'fade', label: 'Cross Dissolve' },
  { id: 'slide-left', type: 'slide', direction: 'left', label: 'Slide Left' },
  { id: 'slide-right', type: 'slide', direction: 'right', label: 'Slide Right' },
  { id: 'slide-up', type: 'slide', direction: 'up', label: 'Slide Up' },
  { id: 'slide-down', type: 'slide', direction: 'down', label: 'Slide Down' },
  { id: 'wipe-left', type: 'wipe', direction: 'left', label: 'Wipe Left' },
  { id: 'wipe-right', type: 'wipe', direction: 'right', label: 'Wipe Right' },
  { id: 'wipe-up', type: 'wipe', direction: 'up', label: 'Wipe Up' },
  { id: 'wipe-down', type: 'wipe', direction: 'down', label: 'Wipe Down' },
  { id: 'zoom-in', type: 'zoom', direction: 'in', label: 'Zoom In' },
  { id: 'zoom-out', type: 'zoom', direction: 'out', label: 'Zoom Out' },
] as const;

/** transition 的 (type,direction) → preset id;无匹配兜底 'fade' */
export const presetIdOf = (t: Pick<Transition, 'type' | 'direction'>): string =>
  TRANSITION_PRESETS.find((p) => p.type === t.type && p.direction === t.direction)?.id ?? 'fade';
```

- [ ] **Step 3: 测试** `transition-presets.test.ts`:11 条唯一 id;每条 type/direction 合法;`presetIdOf({type:'slide',direction:'left'})==='slide-left'`、`presetIdOf({type:'fade'})==='fade'`、未知组合 `presetIdOf({type:'zoom',direction:'left'})==='fade'`(兜底)。

- [ ] **Step 4:** 验证:`pnpm -F @gedatou/shared typecheck` + `pnpm -F @gedatou/shared test`。

- [ ] **Step 5: Commit** `feat(shared): transition type/direction model + preset table`

---

## Task 2: 渲染扩展

**Files:** Modify `packages/shared/src/composition/transitions.ts`(+ 其 test)、`packages/shared/src/composition/ItemRenderer.tsx`、`packages/shared/src/index.ts`。

**Interfaces:** Consumes T1 的 `Transition`。Produces `TransitionRenderProps`(扩)、纯 `transitionVisual`。

- [ ] **Step 1: transitions.ts** — 整体重写为(保留 v1 的重叠窗口 + live 自愈):
```ts
import { interpolate } from 'remotion';
import type { EditorStarterItem, Transition, TransitionType, TransitionDirection, UndoableState } from '../types';

export type TransitionRenderProps = { opacity: number; translate?: string; scale?: string; clipPath?: string };

// role: 'in' = 入场(toItem),'out' = 出场(fromItem);p = 重叠窗口进度 0→1。纯函数、可单测。
export const transitionVisual = (
  type: TransitionType,
  direction: TransitionDirection | undefined,
  role: 'in' | 'out',
  p: number,
): TransitionRenderProps => {
  if (type === 'slide') {
    // exit 单位向量 = 旧内容离场方向;入场从反侧进入
    const exit = direction === 'left' ? [-1, 0] : direction === 'right' ? [1, 0] : direction === 'up' ? [0, -1] : [0, 1];
    const [ex, ey] = exit;
    if (role === 'out') return { opacity: 1, translate: `${ex * 100 * p}% ${ey * 100 * p}%` };
    return { opacity: 1, translate: `${-ex * 100 * (1 - p)}% ${-ey * 100 * (1 - p)}%` };
  }
  if (type === 'wipe') {
    if (role === 'out') return { opacity: 1 }; // 出场不裁,入场盖住
    const r = 100 * (1 - p); // 遮挡边 100%→0
    const clip =
      direction === 'left' ? `inset(0 ${r}% 0 0)` :
      direction === 'right' ? `inset(0 0 0 ${r}%)` :
      direction === 'up' ? `inset(0 0 ${r}% 0)` :
      `inset(${r}% 0 0 0)`; // down
    return { opacity: 1, clipPath: clip };
  }
  if (type === 'zoom') {
    if (direction === 'out') {
      return role === 'in'
        ? { opacity: p, scale: `${1.2 - 0.2 * p}` }
        : { opacity: 1 - p, scale: `${1 - 0.2 * p}` };
    }
    // zoom-in(默认)
    return role === 'in'
      ? { opacity: p, scale: `${0.6 + 0.4 * p}` }
      : { opacity: 1 - p, scale: `${1 + 0.2 * p}` };
  }
  // fade(默认):仅 opacity,与 v1 一致
  return { opacity: role === 'in' ? p : 1 - p };
};

/** item 在某帧因转场获得的渲染 props。absFrame = 合成绝对帧(调用方传 item.from + useCurrentFrame())。 */
export const getTransitionRenderProps = (
  state: UndoableState,
  item: EditorStarterItem,
  absFrame: number,
): TransitionRenderProps => {
  const transitions = state.transitions;
  if (!transitions) return { opacity: 1 };
  let opacity = 1;
  let translate: string | undefined;
  let scale: string | undefined;
  let clipPath: string | undefined;
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
    const start = to.from;
    const end = to.from + d;
    const p = interpolate(absFrame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const rp = transitionVisual(t.type, t.direction, isTo ? 'in' : 'out', p);
    opacity *= rp.opacity;
    if (rp.translate) translate = rp.translate;
    if (rp.scale) scale = rp.scale;
    if (rp.clipPath) clipPath = rp.clipPath;
  }
  return { opacity, translate, scale, clipPath };
};
```

- [ ] **Step 2: ItemRenderer.tsx** — `ItemPositioner` 的 style。现:
```tsx
opacity: baseOpacity * fadeIn * fadeOut * getTransitionRenderProps(ctx.state, item, item.from + frame).opacity,
```
改为先取一次再铺(避免调 4 次):在 `return (` 前加 `const tp = getTransitionRenderProps(ctx.state, item, item.from + frame);`,style 内:
```tsx
opacity: baseOpacity * fadeIn * fadeOut * tp.opacity,
translate: tp.translate,   // 与既有 rotate 自动合成;undefined 无效果
scale: tp.scale,
clipPath: tp.clipPath,
```
(保留既有 `rotate: \`${rotation}deg\``、`borderRadius`、`overflow`。)

- [ ] **Step 3: index.ts(shared)** — 若 `getTransitionRenderProps`/composition 有 barrel 导出,补 `TransitionRenderProps`、`transitionVisual`、`TransitionType`、`TransitionDirection`(核对现有 composition 导出口径,加法)。

- [ ] **Step 4: 测试** 扩 `transitions.test.ts`:
  - fade 不回归:`transitionVisual('fade',undefined,'in',0.5).opacity===0.5`、`'out'` 得 0.5,且 translate/scale/clipPath 均 undefined。
  - slide-left:in 在 p=0 translate `100% 0`、p=1 `0% 0`;out p=1 `-100% 0`。各方向端点。
  - wipe-left:in p=0 `inset(0 100% 0 0)`、p=1 `inset(0 0% 0 0)`;out 无 clipPath。
  - zoom-in:in p=0 `{opacity:0,scale:'0.6'}`、p=1 `{opacity:1,scale:'1'}`;out p=0 scale '1'、p=1 scale '1.2'。zoom-out 端点。
  - 保留 v1 集成断言(`getTransitionRenderProps` 无转场返回 `{opacity:1}`;fade 重叠中点两片段 opacity 0.5;live 自愈)。

- [ ] **Step 5:** 验证 shared typecheck + test;`pnpm --filter "@gedatou/*" build`。

- [ ] **Step 6: Commit** `feat(shared): render slide/wipe/zoom transitions via per-item transform/clipPath`

---

## Task 3: applyTransitionPreset 命令

**Files:** Modify `packages/editor/src/lib/transition-ops.ts`(+ `transition-ops.test.ts`)。

**Interfaces:** Consumes `TRANSITION_PRESETS`(shared/composition)。Produces `applyTransitionPreset(store, id, presetId)`。

- [ ] **Step 1:** 在 transition-ops.ts 顶部 import `TRANSITION_PRESETS`,加命令:
```ts
import { TRANSITION_PRESETS } from '@gedatou/shared/composition';
// ...
/** 换转场预设:写 type + direction(fade 无 direction 则删键),no-op 守卫 */
export const applyTransitionPreset = (store: EditorStoreApi, id: string, presetId: string): void => {
  const preset = TRANSITION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  store.getState().updateUndoable((s) => {
    const t = s.transitions[id];
    if (!t) return s;
    if (t.type === preset.type && t.direction === preset.direction) return s; // no-op 守卫
    const next: Transition = { ...t, type: preset.type };
    if (preset.direction) next.direction = preset.direction;
    else delete next.direction;
    return { ...s, transitions: { ...s.transitions, [id]: next } };
  }, { commit: true });
};
```
> 确认 `@gedatou/shared/composition` 子路径导出了 `TRANSITION_PRESETS`(T2 Step3 / T1);`Transition` 类型已在文件顶 import。

- [ ] **Step 2: 测试** `transition-ops.test.ts` 加:建 fade 转场 → `applyTransitionPreset(store,id,'slide-left')` 后 `type==='slide' && direction==='left'`;再 `applyTransitionPreset(store,id,'fade')` 后 `type==='fade' && direction===undefined`(键删除);相同 preset 二次调用返回**原 state 引用**(no-op:`store.getState().undoable === before`)。

- [ ] **Step 3:** 验证 `pnpm -F @gedatou/editor test transition-ops` + editor typecheck。

- [ ] **Step 4: Commit** `feat(editor): applyTransitionPreset command`

---

## Task 4: 检查器预设菜单 + 导出

**Files:** Modify `packages/editor/src/inspector/Inspector.tsx`(`TransitionPanel`)、`packages/editor/src/index.ts`。

**Interfaces:** Consumes `applyTransitionPreset`(T3)、`TRANSITION_PRESETS`/`presetIdOf`(shared)。

- [ ] **Step 1: TransitionPanel** — 读现有 `TransitionPanel`(Inspector.tsx,`useEditor((s)=>s.undoable.transitions?.[id])`,`if(!t)return null`,Section "Transition" 内 Type 行静态 `Cross Dissolve` + Duration NumberField + 移除按钮)。把 **Type 行**的静态 `<span>Cross Dissolve</span>` 换成预设菜单,**完全复用 AnimationSection 的 Popover 写法**(Inspector.tsx:483-503):
```tsx
// TransitionPanel 内,新增:
const [presetOpen, setPresetOpen] = useState(false);
const api = useEditorApi();
// Type 行:
<Row label="Type">
  <Popover open={presetOpen} onOpenChange={setPresetOpen}>
    <PopoverTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
      {TRANSITION_PRESETS.find((p) => p.id === presetIdOf(t))?.label ?? 'Cross Dissolve'}
      <ChevronDownIcon />
    </PopoverTrigger>
    <PopoverContent align="start" className="w-40 gap-0.5 p-1">
      {TRANSITION_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
          onClick={() => { applyTransitionPreset(api, p.id); setPresetOpen(false); }}
        >
          {p.label}
        </button>
      ))}
    </PopoverContent>
  </Popover>
</Row>
```
> import:`applyTransitionPreset`(../lib/transition-ops)、`TRANSITION_PRESETS, presetIdOf`(@gedatou/shared/composition)。`Popover*`/`Button`/`ChevronDownIcon`/`useState`/`useEditorApi` 该文件已在用(核对)。`applyTransitionPreset(api, p.id)` 的第一参是 store —— 核对 `useEditorApi()` 返回的即 `EditorStoreApi`(AnimationSection 的 `kf` 走 useItemKeyframes,而 addTransition/applyTransitionDuration 在 TimelinePanel 用 `editorApi`;TransitionPanel 里现有 remove/duration 用什么取 store,照它)。Duration 行、移除按钮**保留不动**。

- [ ] **Step 2: 导出** `packages/editor/src/index.ts` 补 `applyTransitionPreset`(与 addTransition/applyTransitionDuration/removeTransition 并列)。核对 shared 的 `TRANSITION_PRESETS`/类型是否需从 editor 再导出(若消费方需要)。

- [ ] **Step 3:** 验证 editor typecheck + `pnpm -r --parallel test` 全绿 + `pnpm --filter "@gedatou/*" build`。

- [ ] **Step 4: Commit** `feat(editor): transition preset menu in inspector`

---

## 完成判据
- `pnpm -r --parallel typecheck` 0;`pnpm -r --parallel test` 全绿(shared/editor 净增测试);`pnpm --filter "@gedatou/*" build` 成功。
- 浏览器:选中转场 pill → 检查器出现预设菜单;换 Slide/Wipe/Zoom → 播放头扫过重叠区,分别看到滑动/擦除/缩放;fade 行为不变;时长框/移除仍工作。
- 未破坏:v1 fade、seam-click 建转场、既有检查器区、106 基线测试。
