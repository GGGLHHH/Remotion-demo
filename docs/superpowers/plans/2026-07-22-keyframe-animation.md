# 关键帧动画机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `@gedatou/shared`/`@gedatou/editor` 加通用关键帧动画:核心 transform(left/top/width/height/rotation/opacity)可逐属性打关键帧、带预设缓动、检查器 ◆ + 时间线关键帧轨、几个动画预设;渲染随帧插值,进 undo/持久化,不破坏现有 fade。

**Architecture:** 数据就地挂 `BaseItem.keyframes`(稀疏,随 UndoableState 白拿 undo/持久化)。纯 eval/edit 逻辑在 `@gedatou/shared/composition/keyframes.ts`(easingFn/resolveProp + 列表助手),预设在 `animation-presets.ts`。渲染器 `ItemPositioner` 用 `resolveProp` 读 transform,opacity 仍乘 fade。编辑侧命令在 `@gedatou/editor/lib/keyframe-ops.ts`(imperative store 函数,可对 store 单测),`useItemKeyframes` hook + `KeyframeToggle` 接检查器,`ItemBlock` 加合并关键帧轨。渲染服务器复用同一 `ItemRenderer`,关键帧自动流到服务端渲染,无额外 plumbing。

**Tech Stack:** pnpm monorepo · React19 + Zustand vanilla store · Remotion(`interpolate`/`Easing`/`useCurrentFrame`,peer,锁 4.0.491)· vitest · tsup。

## Global Constraints

- **frame 基准**:关键帧 `frame` 相对 item 起点(0 = item.from,与 fade 同基准,在 `Sequence` 内 `useCurrentFrame()===0` 处),范围 `[0, durationInFrames]`。
- **值语义**:`item.keyframes[prop]` 非空 → 渲染以关键帧为准、忽略静态 `item[prop]`;开启时用当前 `resolveProp` 值播首帧;清空回退静态。
- **列表不变量**:每属性 `Keyframe[]` 按 `frame` 升序、`frame` 唯一(同帧写入=覆盖)。
- **commit 语义**:高频(scrub/拖拽)`updateUndoable(fn,{commit:false})` + 松手 `commitPending()`;离散操作 `commit:true`(默认)。整段拖拽塌成 1 条 undo。
- **fade 不变**:最终 `opacity = resolveProp(opacity,frame) × fadeIn × fadeOut`。
- **稀疏 & 兼容**:`keyframes` 可选,旧存档无字段即无动画,零迁移;不加进 `baseItemDefaults`(保持 item 默认无此字段)。
- **v1 属性白名单**:仅 `left top width height rotation opacity`。`borderRadius` 及其它不动画。
- **渲染热路径**:`resolveProp` 无关键帧时**提前 return 静态值**,零额外开销。
- **peer/import**:shared 里 `interpolate`/`Easing` 从 `'remotion'` 导入(已是 peer);editor 从 `@gedatou/shared/composition` 导入 eval/edit/preset。

## Verification Recipe

每个任务末尾"验证"统一指:
- 聚焦测试:`pnpm -F @gedatou/shared test <file>` 或 `pnpm -F @gedatou/editor test <file>`
- 类型:`pnpm -F @gedatou/shared typecheck` / `pnpm -F @gedatou/editor typecheck`(或全量 `pnpm -r --parallel typecheck` → 0)
- 全量测试:`pnpm -r --parallel test`(基线 8 文件 + 新增)
- UI/渲染任务额外:`pnpm --filter "@gedatou/*" build` 成功

## File Structure

```
packages/shared/src/
  types.ts                              += KeyframeEasing/Keyframe/AnimatableProp/ANIMATABLE_PROPS + BaseItem.keyframes   (T1)
  composition/keyframes.ts        NEW   easingFn/resolveProp + upsert/removeAt/moveInList/keyframeAt/withKeyframeList     (T2)
  composition/keyframes.test.ts   NEW   (T2)
  composition/animation-presets.ts NEW  PRESET_IDS/PresetId/buildPreset                                                   (T4)
  composition/animation-presets.test.ts NEW (T4)
  composition/index.ts            EDIT  export keyframes + animation-presets                                              (T2,T4)
  composition/ItemRenderer.tsx    EDIT  ItemPositioner 用 resolveProp                                                     (T3)
packages/editor/src/
  lib/keyframe-ops.ts             NEW   toggle/setValue/setEasing/move/moveAtFrame/clear/applyPreset (imperative store)   (T5)
  lib/keyframe-ops.test.ts        NEW   (T5)
  lib/commands.ts                 EDIT  useEditorCommands 暴露关键帧命令                                                  (T5)
  index.ts                        EDIT  导出 keyframe-ops 命令 + useItemKeyframes + re-export PresetId                    (T5,T6)
  inspector/use-item-keyframes.ts NEW   useItemKeyframes hook                                                             (T6)
  inspector/KeyframeToggle.tsx    NEW   ◆ + ◀▶ 组件                                                                       (T6)
  inspector/Inspector.tsx         EDIT  Layout/Fill 行接 KeyframeToggle + onChange 分支 + 预设控件                        (T6,T8)
  timeline/ItemBlock.tsx          EDIT  选中 item 合并关键帧轨 + 拖拽 moveKeyframesAtFrame                                (T7)
```

---

## Task 1: 关键帧类型 + BaseItem.keyframes(shared)

**Files:**
- Modify: `packages/shared/src/types.ts`(在 `BaseItem`(:38-55)前加类型,`BaseItem` 内加字段)

**Interfaces:**
- Produces: `KeyframeEasing`, `Keyframe`, `AnimatableProp`, `ANIMATABLE_PROPS`, `BaseItem.keyframes?`
- 经 `packages/shared/src/index.ts:1` `export * from './types'` 自动对外。

- [ ] **Step 1: 加类型** — 在 `types.ts` 的 `type BaseItem = {` 定义之前插入:

```ts
// ---- 关键帧动画 ----
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
/** frame 相对 item 起点(0 = item.from);同一属性数组按 frame 升序、frame 唯一 */
export type Keyframe = { frame: number; value: number; easing: KeyframeEasing };
/** v1 白名单:核心 transform(底层机制属性无关,以后可扩) */
export type AnimatableProp = 'left' | 'top' | 'width' | 'height' | 'rotation' | 'opacity';
export const ANIMATABLE_PROPS: readonly AnimatableProp[] = ['left', 'top', 'width', 'height', 'rotation', 'opacity'];
```

- [ ] **Step 2: 给 BaseItem 加字段** — 在 `BaseItem` 类型体内(`fadeOutDurationInFrames: number;` 之后)加:

```ts
  /** 稀疏:仅在打了关键帧的属性上存;非空则该属性渲染以关键帧为准、忽略静态值 */
  keyframes?: Partial<Record<AnimatableProp, Keyframe[]>>;
```

- [ ] **Step 3: 验证** — `pnpm -F @gedatou/shared typecheck`(期望 0);`pnpm -F @gedatou/shared test`(基线绿,未新增)。

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "$(cat <<'EOF'
feat(shared): keyframe types + BaseItem.keyframes field

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 关键帧 eval + 列表助手(shared,TDD)

**Files:**
- Create: `packages/shared/src/composition/keyframes.ts`
- Create: `packages/shared/src/composition/keyframes.test.ts`
- Modify: `packages/shared/src/composition/index.ts`(导出)

**Interfaces:**
- Produces: `easingFn(e)`, `resolveProp(item, prop, frame)`, `upsertKeyframe(list, kf)`, `removeKeyframeAt(list, frame)`, `moveKeyframeInList(list, from, to)`, `keyframeAt(list, frame)`, `withKeyframeList(item, prop, list)`
- Consumes: `interpolate`, `Easing` from `'remotion'`;类型从 `'../types'`。

- [ ] **Step 1: 写失败测试** — `packages/shared/src/composition/keyframes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSolidItem } from '../factories';
import { easingFn, keyframeAt, moveKeyframeInList, removeKeyframeAt, resolveProp, upsertKeyframe, withKeyframeList } from './keyframes';
import type { Keyframe } from '../types';

const kf = (frame: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({ frame, value, easing });
const item = (kfs?: Record<string, Keyframe[]>) => ({ ...createSolidItem({ trackId: 't', from: 0, width: 100, height: 100 }), left: 10, opacity: 1, ...(kfs ? { keyframes: kfs } : {}) });

describe('easingFn', () => {
  it('linear 恒等,hold 为标记', () => {
    expect(easingFn('linear')(0.5)).toBeCloseTo(0.5);
    expect(easingFn('hold')).toBe('hold');
  });
});

describe('resolveProp', () => {
  it('无关键帧回退静态值', () => {
    expect(resolveProp(item(), 'left', 5)).toBe(10);
  });
  it('单关键帧返回其值', () => {
    expect(resolveProp(item({ left: [kf(0, 99)] }), 'left', 3)).toBe(99);
  });
  it('段内线性插值', () => {
    const it = item({ left: [kf(0, 0), kf(10, 100)] });
    expect(resolveProp(it, 'left', 5)).toBeCloseTo(50);
  });
  it('边界外 clamp 到端点', () => {
    const it = item({ left: [kf(4, 20), kf(8, 60)] });
    expect(resolveProp(it, 'left', 0)).toBe(20);
    expect(resolveProp(it, 'left', 100)).toBe(60);
  });
  it('hold 出向关键帧到下一帧前阶跃', () => {
    const it = item({ left: [kf(0, 0, 'hold'), kf(10, 100)] });
    expect(resolveProp(it, 'left', 9)).toBe(0);
    expect(resolveProp(it, 'left', 10)).toBe(100);
  });
});

describe('list helpers', () => {
  it('upsert 保持升序、同帧覆盖', () => {
    let l = upsertKeyframe([], kf(10, 1));
    l = upsertKeyframe(l, kf(0, 2));
    l = upsertKeyframe(l, kf(10, 9)); // 覆盖 frame 10
    expect(l.map((k) => k.frame)).toEqual([0, 10]);
    expect(keyframeAt(l, 10)!.value).toBe(9);
  });
  it('removeAt 删指定帧', () => {
    expect(removeKeyframeAt([kf(0, 1), kf(5, 2)], 5).map((k) => k.frame)).toEqual([0]);
  });
  it('move 改帧并保持升序;撞帧覆盖', () => {
    const l = moveKeyframeInList([kf(0, 1), kf(5, 2)], 0, 8);
    expect(l.map((k) => k.frame)).toEqual([5, 8]);
  });
  it('withKeyframeList 空列表删属性、末属性清空则去 keyframes', () => {
    const withL = withKeyframeList(item(), 'left', [kf(0, 1)]);
    expect(withL.keyframes!.left).toHaveLength(1);
    const cleared = withKeyframeList(withL, 'left', []);
    expect(cleared.keyframes).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm -F @gedatou/shared test src/composition/keyframes.test.ts`;期望 FAIL(`Cannot find module './keyframes'`)。

- [ ] **Step 3: 写实现** — `packages/shared/src/composition/keyframes.ts`:

```ts
import { Easing, interpolate } from 'remotion';
import type { AnimatableProp, EditorStarterItem, Keyframe, KeyframeEasing } from '../types';

const EASE: Record<KeyframeEasing, ((t: number) => number) | 'hold'> = {
  linear: (t) => t,
  easeIn: Easing.in(Easing.cubic),
  easeOut: Easing.out(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
  hold: 'hold',
};

export const easingFn = (e: KeyframeEasing): ((t: number) => number) | 'hold' => EASE[e];

/** 某属性在某帧的值;无关键帧提前回退静态值(渲染热路径零额外开销) */
export const resolveProp = (item: EditorStarterItem, prop: AnimatableProp, frame: number): number => {
  const kfs = item.keyframes?.[prop];
  if (!kfs || kfs.length === 0) return item[prop] as number;
  if (kfs.length === 1) return kfs[0].value;
  if (frame <= kfs[0].frame) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return last.value;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].frame <= frame) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const ease = EASE[a.easing];
  if (ease === 'hold') return a.value;
  return interpolate(frame, [a.frame, b.frame], [a.value, b.value], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const sortKf = (l: Keyframe[]): Keyframe[] => [...l].sort((x, y) => x.frame - y.frame);
export const keyframeAt = (list: Keyframe[] | undefined, frame: number): Keyframe | undefined =>
  list?.find((k) => k.frame === frame);
export const upsertKeyframe = (list: Keyframe[], kf: Keyframe): Keyframe[] =>
  sortKf([...list.filter((k) => k.frame !== kf.frame), kf]);
export const removeKeyframeAt = (list: Keyframe[], frame: number): Keyframe[] =>
  list.filter((k) => k.frame !== frame);
export const moveKeyframeInList = (list: Keyframe[], from: number, to: number): Keyframe[] => {
  const k = list.find((x) => x.frame === from);
  if (!k) return list;
  return upsertKeyframe(list.filter((x) => x.frame !== from), { ...k, frame: to });
};

/** 不可变写回某属性关键帧;空列表删该属性,keyframes 全空则去掉字段 */
export const withKeyframeList = (
  item: EditorStarterItem,
  prop: AnimatableProp,
  list: Keyframe[],
): EditorStarterItem => {
  const next: Partial<Record<AnimatableProp, Keyframe[]>> = { ...(item.keyframes ?? {}) };
  if (list.length === 0) delete next[prop];
  else next[prop] = list;
  const keyframes = Object.keys(next).length ? next : undefined;
  return { ...item, keyframes };
};
```

- [ ] **Step 4: 跑测试确认通过** — `pnpm -F @gedatou/shared test src/composition/keyframes.test.ts`;期望 PASS。

- [ ] **Step 5: 导出** — `packages/shared/src/composition/index.ts` 追加:

```ts
export * from './keyframes';
```

- [ ] **Step 6: 验证**(Recipe:shared typecheck 0、`pnpm -r --parallel test` 全绿)。

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/composition/keyframes.ts packages/shared/src/composition/keyframes.test.ts packages/shared/src/composition/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): keyframe eval (resolveProp/easingFn) + list helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 渲染器用 resolveProp(shared)

**Files:**
- Modify: `packages/shared/src/composition/ItemRenderer.tsx`(`ItemPositioner`,:78-117)

**Interfaces:**
- Consumes: `resolveProp` from `./keyframes`。

- [ ] **Step 1: 改 ItemPositioner** — 在 `ItemRenderer.tsx` 顶部 import 加 `import { resolveProp } from './keyframes';`。把 `ItemPositioner`(:78-117)里读静态属性的部分改为(保留 `frame`/`fadeIn`/`fadeOut` 逻辑不动):

```tsx
  const frame = useCurrentFrame(); // Sequence 内:0 = item 开始
  // fadeIn / fadeOut 保持原样(:84-99)不动
  const left = resolveProp(item, 'left', frame);
  const top = resolveProp(item, 'top', frame);
  const width = resolveProp(item, 'width', frame);
  const height = resolveProp(item, 'height', frame);
  const rotation = resolveProp(item, 'rotation', frame);
  const baseOpacity = resolveProp(item, 'opacity', frame);
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        rotate: `${rotation}deg`,
        opacity: baseOpacity * fadeIn * fadeOut,
        borderRadius: item.borderRadius,
        overflow: item.borderRadius > 0 ? 'hidden' : undefined,
      }}
    >
      <ItemContent item={item} ctx={ctx} trackMuted={trackMuted} />
    </div>
  );
```

> 只替换 6 个 transform 读取 + opacity 表达式;`borderRadius`/`overflow`/fade 不动。

- [ ] **Step 2: 验证** — shared typecheck 0;`pnpm -F @gedatou/shared test`(现有合成相关测试若有,应仍绿;无关键帧时 `resolveProp` 回退静态 → 行为不变)。`pnpm --filter "@gedatou/*" build` 成功(渲染 bundle 编译)。

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/composition/ItemRenderer.tsx
git commit -m "$(cat <<'EOF'
feat(shared): ItemPositioner resolves transform props via keyframes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 动画预设生成器(shared,TDD)

**Files:**
- Create: `packages/shared/src/composition/animation-presets.ts`
- Create: `packages/shared/src/composition/animation-presets.test.ts`
- Modify: `packages/shared/src/composition/index.ts`

**Interfaces:**
- Produces: `PRESET_IDS`, `PresetId`, `buildPreset(id, item): Partial<Record<AnimatableProp, Keyframe[]>>`

- [ ] **Step 1: 写失败测试** — `animation-presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSolidItem } from '../factories';
import { PRESET_IDS, buildPreset } from './animation-presets';

const item = () => ({ ...createSolidItem({ trackId: 't', from: 0, width: 200, height: 100 }), left: 50, top: 30, opacity: 1, durationInFrames: 90 });

describe('buildPreset', () => {
  it('fadeIn:opacity 从 0 到 1,首帧在 0', () => {
    const p = buildPreset('fadeIn', item());
    expect(p.opacity![0]).toMatchObject({ frame: 0, value: 0 });
    expect(p.opacity![p.opacity!.length - 1].value).toBe(1);
  });
  it('fadeOut:末帧 opacity=0、末帧 frame=dur', () => {
    const p = buildPreset('fadeOut', item());
    const last = p.opacity![p.opacity!.length - 1];
    expect(last).toMatchObject({ frame: 90, value: 0 });
  });
  it('slideInLeft:left 从屏外(< item.left)回到 item.left', () => {
    const p = buildPreset('slideInLeft', item());
    expect(p.left![0].value).toBeLessThan(50);
    expect(p.left![p.left!.length - 1].value).toBe(50);
  });
  it('zoomIn:width/height 从 0 到原值', () => {
    const p = buildPreset('zoomIn', item());
    expect(p.width![0].value).toBe(0);
    expect(p.width![p.width!.length - 1].value).toBe(200);
    expect(p.height![p.height!.length - 1].value).toBe(100);
  });
  it('每个 PRESET_ID 都能产出至少一个属性', () => {
    for (const id of PRESET_IDS) expect(Object.keys(buildPreset(id, item())).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm -F @gedatou/shared test src/composition/animation-presets.test.ts`;期望 FAIL(模块缺失)。

- [ ] **Step 3: 写实现** — `animation-presets.ts`:

```ts
import type { AnimatableProp, EditorStarterItem, Keyframe } from '../types';

export const PRESET_IDS = [
  'fadeIn', 'fadeOut', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'zoomIn', 'zoomOut',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

const kf = (frame: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({ frame, value, easing });

/** 默认动画时长(帧):dur/3,封顶 15,至少 1(无 fps 依赖) */
const animDur = (dur: number): number => Math.max(1, Math.min(15, Math.round(dur / 3)));

const fadeInKf = (D: number): Keyframe[] => [kf(0, 0, 'easeOut'), kf(D, 1)];
const fadeOutKf = (dur: number, D: number): Keyframe[] => [kf(dur - D, 1, 'easeIn'), kf(dur, 0)];

export const buildPreset = (id: PresetId, item: EditorStarterItem): Partial<Record<AnimatableProp, Keyframe[]>> => {
  const dur = item.durationInFrames;
  const D = animDur(dur);
  switch (id) {
    case 'fadeIn':
      return { opacity: fadeInKf(D) };
    case 'fadeOut':
      return { opacity: fadeOutKf(dur, D) };
    case 'slideInLeft':
      return { left: [kf(0, item.left - item.width, 'easeOut'), kf(D, item.left)], opacity: fadeInKf(D) };
    case 'slideInRight':
      return { left: [kf(0, item.left + item.width, 'easeOut'), kf(D, item.left)], opacity: fadeInKf(D) };
    case 'slideInTop':
      return { top: [kf(0, item.top - item.height, 'easeOut'), kf(D, item.top)], opacity: fadeInKf(D) };
    case 'slideInBottom':
      return { top: [kf(0, item.top + item.height, 'easeOut'), kf(D, item.top)], opacity: fadeInKf(D) };
    case 'zoomIn':
      return {
        width: [kf(0, 0, 'easeOut'), kf(D, item.width)],
        height: [kf(0, 0, 'easeOut'), kf(D, item.height)],
        opacity: fadeInKf(D),
      };
    case 'zoomOut':
      return {
        width: [kf(dur - D, item.width, 'easeIn'), kf(dur, 0)],
        height: [kf(dur - D, item.height, 'easeIn'), kf(dur, 0)],
        opacity: fadeOutKf(dur, D),
      };
  }
};
```

- [ ] **Step 4: 跑测试确认通过** — `pnpm -F @gedatou/shared test src/composition/animation-presets.test.ts`;期望 PASS。

- [ ] **Step 5: 导出** — `composition/index.ts` 追加 `export * from './animation-presets';`。

- [ ] **Step 6: 验证**(Recipe)。

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/composition/animation-presets.ts packages/shared/src/composition/animation-presets.test.ts packages/shared/src/composition/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): animation preset keyframe generators

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 关键帧命令(editor,imperative + 单测)

**Files:**
- Create: `packages/editor/src/lib/keyframe-ops.ts`
- Create: `packages/editor/src/lib/keyframe-ops.test.ts`
- Modify: `packages/editor/src/lib/commands.ts`(暴露命令)
- Modify: `packages/editor/src/index.ts`(导出命令 + re-export `PresetId`/`AnimatableProp`)

**Interfaces:**
- Produces: `toggleKeyframe(store, itemId, prop, frame)`, `setKeyframeValue(store, itemId, prop, frame, value, commit?)`, `setKeyframeEasing(store, itemId, prop, frame, easing)`, `moveKeyframe(store, itemId, prop, from, to, commit?)`, `moveKeyframesAtFrame(store, itemId, from, to, commit?)`, `clearKeyframes(store, itemId, prop)`, `applyAnimationPreset(store, itemId, presetId)`
- Consumes: `EditorStoreApi`(`../state/store`);shared eval/edit/preset(`@gedatou/shared/composition`)、类型(`@gedatou/shared`)。
- 命令签名对齐 `lib/add-items.ts` 的 `(store, ...) => void`,内部走 `store.getState().updateUndoable(...)`。

- [ ] **Step 1: 写失败测试** — `packages/editor/src/lib/keyframe-ops.test.ts`(对 store 直测,createEditorStore + createSolidItem 注入 item):

```ts
import { describe, expect, it } from 'vitest';
import { createSolidItem } from '@gedatou/shared';
import { createEditorStore } from '../state/store';
import { applyAnimationPreset, clearKeyframes, moveKeyframe, setKeyframeValue, toggleKeyframe } from './keyframe-ops';

const mk = () => {
  const store = createEditorStore();
  const item = { ...createSolidItem({ trackId: 't', from: 0, width: 100, height: 100 }), left: 10, opacity: 1, durationInFrames: 60 };
  store.getState().updateUndoable((s) => ({ ...s, items: { ...s.items, [item.id]: item } }));
  return { store, id: item.id, get: () => store.getState().undoable.items[item.id] };
};

describe('keyframe-ops', () => {
  it('toggle 加(值=当前静态)再删', () => {
    const { store, id, get } = mk();
    toggleKeyframe(store, id, 'left', 5);
    expect(get().keyframes!.left).toEqual([{ frame: 5, value: 10, easing: 'easeInOut' }]);
    toggleKeyframe(store, id, 'left', 5);
    expect(get().keyframes).toBeUndefined();
  });
  it('setKeyframeValue upsert 保持升序', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 10, 100);
    setKeyframeValue(store, id, 'left', 0, 0);
    expect(get().keyframes!.left!.map((k) => k.frame)).toEqual([0, 10]);
  });
  it('move 改帧;frame clamp 到 [0,dur]', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 5, 1);
    moveKeyframe(store, id, 'left', 5, 999);
    expect(get().keyframes!.left![0].frame).toBe(60);
  });
  it('clear 回退静态(去 keyframes)', () => {
    const { store, id, get } = mk();
    setKeyframeValue(store, id, 'left', 5, 1);
    clearKeyframes(store, id, 'left');
    expect(get().keyframes).toBeUndefined();
  });
  it('applyPreset fadeIn 写 opacity 两帧', () => {
    const { store, id, get } = mk();
    applyAnimationPreset(store, id, 'fadeIn');
    expect(get().keyframes!.opacity).toHaveLength(2);
  });
  it('commit:false 不进 undo,commitPending 收 1 条', () => {
    const { store, id } = mk();
    const past0 = store.getState().past.length;
    setKeyframeValue(store, id, 'left', 5, 1, false);
    expect(store.getState().past.length).toBe(past0); // 未提交
    store.getState().commitPending();
    expect(store.getState().past.length).toBe(past0 + 1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm -F @gedatou/editor test src/lib/keyframe-ops.test.ts`;FAIL(模块缺失)。

- [ ] **Step 3: 写实现** — `packages/editor/src/lib/keyframe-ops.ts`:

```ts
import type { AnimatableProp, EditorStarterItem, KeyframeEasing } from '@gedatou/shared';
import {
  buildPreset,
  keyframeAt,
  moveKeyframeInList,
  removeKeyframeAt,
  resolveProp,
  upsertKeyframe,
  withKeyframeList,
  type PresetId,
} from '@gedatou/shared/composition';
import type { EditorStoreApi } from '../state/store';

const clampFrame = (item: EditorStarterItem, f: number): number =>
  Math.max(0, Math.min(item.durationInFrames, Math.round(f)));

type ListFn = (list: import('@gedatou/shared').Keyframe[], item: EditorStarterItem) => import('@gedatou/shared').Keyframe[];

const patchKf = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, fn: ListFn, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it) return s;
    const next = withKeyframeList(it, prop, fn(it.keyframes?.[prop] ?? [], it));
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit });
};

export const toggleKeyframe = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const f = clampFrame(it, frame);
    if (keyframeAt(list, f)) return removeKeyframeAt(list, f);
    return upsertKeyframe(list, { frame: f, value: resolveProp(it, prop, f), easing: 'easeInOut' });
  });

export const setKeyframeValue = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number, value: number, commit = true): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const f = clampFrame(it, frame);
    return upsertKeyframe(list, { frame: f, value, easing: keyframeAt(list, f)?.easing ?? 'easeInOut' });
  }, commit);

export const setKeyframeEasing = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, frame: number, easing: KeyframeEasing): void =>
  patchKf(store, itemId, prop, (list, it) => {
    const k = keyframeAt(list, clampFrame(it, frame));
    return k ? upsertKeyframe(list, { ...k, easing }) : list;
  });

export const moveKeyframe = (store: EditorStoreApi, itemId: string, prop: AnimatableProp, from: number, to: number, commit = true): void =>
  patchKf(store, itemId, prop, (list, it) => moveKeyframeInList(list, from, clampFrame(it, to)), commit);

export const clearKeyframes = (store: EditorStoreApi, itemId: string, prop: AnimatableProp): void =>
  patchKf(store, itemId, prop, () => []);

/** 把某帧上所有属性的关键帧一起挪(时间线合并轨拖拽) */
export const moveKeyframesAtFrame = (store: EditorStoreApi, itemId: string, from: number, to: number, commit = true): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it?.keyframes) return s;
    const f = clampFrame(it, to);
    let next = it;
    for (const prop of Object.keys(it.keyframes) as AnimatableProp[]) {
      const list = it.keyframes[prop];
      if (list && keyframeAt(list, from)) next = withKeyframeList(next, prop, moveKeyframeInList(list, from, f));
    }
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit });
};

export const applyAnimationPreset = (store: EditorStoreApi, itemId: string, presetId: PresetId): void => {
  store.getState().updateUndoable((s) => {
    const it = s.items[itemId];
    if (!it) return s;
    const preset = buildPreset(presetId, it);
    let next = it;
    for (const prop of Object.keys(preset) as AnimatableProp[]) next = withKeyframeList(next, prop, preset[prop]!);
    return { ...s, items: { ...s.items, [itemId]: next } };
  }, { commit: true });
};
```

> 若 `EditorStoreApi` 未从 `../state/store` 导出该名,按 `index.ts:92`(`EditorStoreApi` 已是公开类型)找到其定义处导入。`Keyframe` 类型从 `@gedatou/shared` 顶层导入(避免 `import('...')` 内联,若嫌丑可改成顶部 `import type { Keyframe } from '@gedatou/shared'`)。

- [ ] **Step 4: 跑测试确认通过** — `pnpm -F @gedatou/editor test src/lib/keyframe-ops.test.ts`;PASS。

- [ ] **Step 5: 接入 useEditorCommands** — 在 `lib/commands.ts` 的 `useEditorCommands()` 返回对象里(参照 `addSolid` 的 `api` 用法,`api = useEditorApi()`)加:

```ts
    toggleKeyframe: (itemId: string, prop: AnimatableProp, frame?: number) =>
      toggleKeyframe(api, itemId, prop, frame ?? refs.getPlayerFrame() - (api.getState().undoable.items[itemId]?.from ?? 0)),
    applyAnimationPreset: (itemId: string, presetId: PresetId) => applyAnimationPreset(api, itemId, presetId),
```

> 头部 import `toggleKeyframe, applyAnimationPreset` from `'./keyframe-ops'`,类型从 `'@gedatou/shared'`/`'@gedatou/shared/composition'`。只暴露头less 常用的三个即可;检查器走 hook(T6)不依赖这里。

- [ ] **Step 6: 导出** — `packages/editor/src/index.ts` 加:

```ts
export {
  applyAnimationPreset, clearKeyframes, moveKeyframe, moveKeyframesAtFrame,
  setKeyframeEasing, setKeyframeValue, toggleKeyframe,
} from './lib/keyframe-ops';
export type { AnimatableProp, Keyframe, KeyframeEasing } from '@gedatou/shared';
export type { PresetId } from '@gedatou/shared/composition';
```

- [ ] **Step 7: 验证**(Recipe:editor typecheck 0、`pnpm -r --parallel test` 全绿)。

- [ ] **Step 8: Commit**

```bash
git add packages/editor/src/lib/keyframe-ops.ts packages/editor/src/lib/keyframe-ops.test.ts packages/editor/src/lib/commands.ts packages/editor/src/index.ts
git commit -m "$(cat <<'EOF'
feat(editor): keyframe store commands + headless/public exports

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 检查器 ◆ + 数值框写关键帧(editor)

**Files:**
- Create: `packages/editor/src/inspector/use-item-keyframes.ts`
- Create: `packages/editor/src/inspector/KeyframeToggle.tsx`
- Modify: `packages/editor/src/inspector/Inspector.tsx`(`LayoutSection` :305-437、`FillSection` :453-461 的属性行 + `ItemPanel` :655 附近取 hook)
- Modify: `packages/editor/src/index.ts`(导出 `useItemKeyframes`)

**Interfaces:**
- Produces: `useItemKeyframes(itemId): ItemKeyframesApi`(`has/at/toggle/setValue/setEasing/move/clear/applyPreset/nextFrame/prevFrame/seekToItemFrame`);`KeyframeToggle`。
- Consumes: `useEditor/useEditorApi/useEditorRefs`;keyframe-ops(T5);`usePlayerFrameDerived`(`canvas/player-ref.ts:27`)。

- [ ] **Step 1: hook** — `inspector/use-item-keyframes.ts`:

```ts
import { useMemo } from 'react';
import type { AnimatableProp, KeyframeEasing } from '@gedatou/shared';
import { keyframeAt, type PresetId } from '@gedatou/shared/composition';
import { useEditor, useEditorApi, useEditorRefs } from '../state/context';
import {
  applyAnimationPreset, clearKeyframes, moveKeyframe, setKeyframeEasing, setKeyframeValue, toggleKeyframe,
} from '../lib/keyframe-ops';

export type ItemKeyframesApi = {
  has: (prop: AnimatableProp) => boolean;
  at: (prop: AnimatableProp, frameInItem: number) => boolean;
  toggle: (prop: AnimatableProp, frameInItem: number) => void;
  setValue: (prop: AnimatableProp, frameInItem: number, value: number, commit?: boolean) => void;
  setEasing: (prop: AnimatableProp, frameInItem: number, easing: KeyframeEasing) => void;
  move: (prop: AnimatableProp, from: number, to: number, commit?: boolean) => void;
  clear: (prop: AnimatableProp) => void;
  applyPreset: (id: PresetId) => void;
  nextFrame: (prop: AnimatableProp, frameInItem: number) => number | null;
  prevFrame: (prop: AnimatableProp, frameInItem: number) => number | null;
  seekToItemFrame: (frameInItem: number) => void;
};

export const useItemKeyframes = (itemId: string): ItemKeyframesApi => {
  const api = useEditorApi();
  const refs = useEditorRefs();
  const item = useEditor((s) => s.undoable.items[itemId]);
  return useMemo<ItemKeyframesApi>(() => {
    const list = (prop: AnimatableProp) => item?.keyframes?.[prop] ?? [];
    return {
      has: (prop) => list(prop).length > 0,
      at: (prop, f) => !!keyframeAt(list(prop), f),
      toggle: (prop, f) => toggleKeyframe(api, itemId, prop, f),
      setValue: (prop, f, v, commit = true) => setKeyframeValue(api, itemId, prop, f, v, commit),
      setEasing: (prop, f, e) => setKeyframeEasing(api, itemId, prop, f, e),
      move: (prop, from, to, commit = true) => moveKeyframe(api, itemId, prop, from, to, commit),
      clear: (prop) => clearKeyframes(api, itemId, prop),
      applyPreset: (id) => applyAnimationPreset(api, itemId, id),
      nextFrame: (prop, f) => list(prop).find((k) => k.frame > f)?.frame ?? null,
      prevFrame: (prop, f) => [...list(prop)].reverse().find((k) => k.frame < f)?.frame ?? null,
      seekToItemFrame: (f) => refs.player.current?.seekTo((item?.from ?? 0) + f),
    };
  }, [api, refs, itemId, item]);
};
```

> 确认 `useEditorApi`/`useEditorRefs`/`useEditor` 的导入路径(集成图:定义在 `state/context.tsx`)。`refs.player` 为 Remotion PlayerRef(`instance-refs.ts:12`)。

- [ ] **Step 2: KeyframeToggle** — `inspector/KeyframeToggle.tsx`:

```tsx
import type React from 'react';
import { Diamond } from 'lucide-react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { cn } from '../lib/utils'; // 若无 cn,用现有工具或直接拼 className
import type { ItemKeyframesApi } from './use-item-keyframes';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const KeyframeToggle: React.FC<{ item: EditorStarterItem; prop: AnimatableProp; kf: ItemKeyframesApi }> = ({ item, prop, kf }) => {
  const frameInItem = usePlayerFrameDerived((f) => clamp(f - item.from, 0, item.durationInFrames));
  const active = kf.at(prop, frameInItem);
  const has = kf.has(prop);
  const go = (target: number | null) => target != null && kf.seekToItemFrame(target);
  return (
    <span className="inline-flex items-center gap-0.5">
      {has && (
        <button type="button" aria-label="prev keyframe" className="text-muted-foreground disabled:opacity-30"
          disabled={kf.prevFrame(prop, frameInItem) == null} onClick={() => go(kf.prevFrame(prop, frameInItem))}>◀</button>
      )}
      <button type="button" aria-label="toggle keyframe"
        className={cn('rounded p-0.5', active ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
        onClick={() => kf.toggle(prop, frameInItem)}>
        <Diamond className={cn('size-3', active && 'fill-current')} />
      </button>
      {has && (
        <button type="button" aria-label="next keyframe" className="text-muted-foreground disabled:opacity-30"
          disabled={kf.nextFrame(prop, frameInItem) == null} onClick={() => go(kf.nextFrame(prop, frameInItem))}>▶</button>
      )}
    </span>
  );
};
```

> `lucide-react` 已是依赖(库内置原语用它)。`cn`:检查 editor 里现有 className 合并工具(多半有 `lib/utils`);无则内联字符串。`usePlayerFrameDerived` 只在派生原语变化时重渲,不会每帧刷。

- [ ] **Step 3: 接 ItemPanel** — 在 `Inspector.tsx` 的 `ItemPanel`(取 `patch = useItemPatch(item.id)` 处,:655)旁加 `const kf = useItemKeyframes(item.id);`,并把 `kf` 传入 `LayoutSection`/`FillSection`(给这两个 section 组件加 `kf: ItemKeyframesApi` prop)。同时在 section 内取当前 item 内帧:

```tsx
const frameInItem = usePlayerFrameDerived((f) => Math.max(0, Math.min(item.durationInFrames, f - item.from)));
const animPatch = (prop: AnimatableProp, v: number, commit?: boolean) =>
  kf.has(prop) ? kf.setValue(prop, frameInItem, v, commit) : patch({ [prop]: v } as Partial<EditorStarterItem>, commit);
```

- [ ] **Step 4: 每个 transform 行加 ◆ 并改 onChange** — 对以下 6 行(集成图给出确切位置)做同一改造:①X(:381 left)②Y(:382 top)③W(:388 通过 setW → 改成 `animPatch('width', v, c)` 但保留 setW 的 aspect-lock 逻辑时改写 setW 内部用 animPatch)④H(:389 setH 同理)⑤rotation(:411-417)⑥opacity(FillSection :453-461,注意 UI 0-100 → 值 /100)。以 X 为例(其余照此,替换 prop/取值):

```tsx
<div className="flex items-center gap-1">
  <NumberField inline label="X" value={item.left} onChange={(v, c) => animPatch('left', v, c)} />
  <KeyframeToggle item={item} prop="left" kf={kf} />
</div>
```

opacity(SliderField)例:

```tsx
<div className="flex items-center gap-1">
  <SliderField ... value={item.opacity * 100} onChange={(v) => animPatch('opacity', v / 100, false)} />
  <KeyframeToggle item={item} prop="opacity" kf={kf} />
</div>
```

> W/H 若走 `setW`/`setH`(含宽高联动锁),把这俩内部的 `patch({width:...})` 改成 `animPatch('width', ...)`(联动写另一维时也用 animPatch),保证有关键帧时写关键帧、否则写静态。**保持 aspect-lock 行为不变。**

- [ ] **Step 5: 导出 hook** — `index.ts` 加 `export { useItemKeyframes } from './inspector/use-item-keyframes'; export type { ItemKeyframesApi } from './inspector/use-item-keyframes';`。

- [ ] **Step 6: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。(浏览器冒烟由控制器统一做。)

- [ ] **Step 7: Commit**

```bash
git add packages/editor/src/inspector/use-item-keyframes.ts packages/editor/src/inspector/KeyframeToggle.tsx packages/editor/src/inspector/Inspector.tsx packages/editor/src/index.ts
git commit -m "$(cat <<'EOF'
feat(editor): inspector keyframe diamonds + value-writes-keyframe

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 时间线合并关键帧轨(editor)

**Files:**
- Modify: `packages/editor/src/timeline/ItemBlock.tsx`(:95 组件体内,加选中态判断 + 关键帧轨 overlay)

**Interfaces:**
- Consumes: `moveKeyframesAtFrame`(T5)、`useEditor`(选中态)、`useEditorApi`、`zoom`(px/frame,已是 prop)、`startHandleDrag` 骨架(:141-160)。

- [ ] **Step 1: 选中态 + 合并关键帧帧集** — 在 `ItemBlock` 组件体内(拿到 `item`/`zoom` 后)加:

```tsx
const selected = useEditor((s) => s.selected.includes(item.id));
const kfFrames = useMemo(() => {
  const set = new Set<number>();
  const kfs = item.keyframes;
  if (kfs) for (const p of Object.keys(kfs)) for (const k of kfs[p as keyof typeof kfs]!) set.add(k.frame);
  return [...set].sort((a, b) => a - b);
}, [item.keyframes]);
```

- [ ] **Step 2: 关键帧轨 overlay** — 仅 `selected && kfFrames.length > 0` 时,在块内底部渲染一条 8px 高的轨,每帧一个可拖点(`frameInItem * zoom` 定位)。放在块内容层、避开 trim(z-30)/fade(z-40)/volume(z-20)——用块底部一条 `z-10` 的 strip:

```tsx
{selected && kfFrames.length > 0 && (
  <div className="absolute inset-x-0 bottom-0 h-2 z-10" data-kf-lane>
    {kfFrames.map((f) => (
      <button
        key={f}
        type="button"
        data-kf-dot
        className="absolute bottom-0 size-2 -translate-x-1/2 rotate-45 bg-primary border border-background"
        style={{ left: f * zoom }}
        onPointerDown={(e) => onKeyframeDotDown(e, f)}
      />
    ))}
  </div>
)}
```

- [ ] **Step 3: 拖拽移动** — 用 `startHandleDrag` 骨架(:141-160,捕获指针、move 时 commit:false、up 时 commitPending),把落点像素换算成帧并 `moveKeyframesAtFrame`。在组件内定义:

```tsx
const api = useEditorApi();
const onKeyframeDotDown = (e: React.PointerEvent, fromFrame: number) => {
  e.stopPropagation(); // 别触发块 move
  const startX = e.clientX;
  startHandleDrag(e, {
    onMove: (ev) => {
      const to = Math.round(fromFrame + (ev.clientX - startX) / zoom);
      moveKeyframesAtFrame(api, item.id, fromFrame, Math.max(0, Math.min(item.durationInFrames, to)), false);
    },
    onCommit: () => api.getState().commitPending(),
  });
};
```

> `startHandleDrag` 的实际签名以 `ItemBlock.tsx:141-160` 为准(集成图称其"捕获指针、commit:false on move、commitPending on up");若签名不同,按其形状适配 onMove/onCommit。**关键:`e.stopPropagation()` 防止冒泡到块 move 手势(:261)。** 拖拽过程 `fromFrame` 需随每次移动更新为最新落帧(否则第二次 move 找不到原帧)——用一个 `let cur = fromFrame;` 闭包,每次 move 后 `cur = to`,下次以 `cur` 为 from。

修正 onMove(带 cur 追踪):

```tsx
let cur = fromFrame;
startHandleDrag(e, {
  onMove: (ev) => {
    const to = Math.max(0, Math.min(item.durationInFrames, Math.round(fromFrame + (ev.clientX - startX) / zoom)));
    if (to !== cur) { moveKeyframesAtFrame(api, item.id, cur, to, false); cur = to; }
  },
  onCommit: () => api.getState().commitPending(),
});
```

- [ ] **Step 4: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/timeline/ItemBlock.tsx
git commit -m "$(cat <<'EOF'
feat(editor): timeline merged keyframe lane with drag-to-retime

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 动画预设控件(editor)

**Files:**
- Modify: `packages/editor/src/inspector/Inspector.tsx`(在 `ItemPanel` 加一个"动画预设"行/区,用已取的 `kf`)

**Interfaces:**
- Consumes: `useItemKeyframes` 的 `applyPreset`;`PRESET_IDS` from `@gedatou/shared/composition`。

- [ ] **Step 1: 预设选择控件** — 在 `ItemPanel` 里(`LayoutSection` 之后合适位置)加一个 `Section`/`Row`(用现有 `inspector/fields.tsx` 的 `Section`/`Row`),内含一个原生 `<select>`(或库里已有的 Select 原语)列出 `PRESET_IDS`,选中即 `kf.applyPreset(id)`:

```tsx
import { PRESET_IDS, type PresetId } from '@gedatou/shared/composition';
// ...
<Section title={t('inspector.animation') ?? 'Animation'}>
  <Row label={t('inspector.preset') ?? 'Preset'}>
    <select
      className="h-7 rounded border bg-transparent px-1 text-xs"
      value=""
      onChange={(e) => { const v = e.target.value as PresetId; if (v) kf.applyPreset(v); e.currentTarget.value = ''; }}
    >
      <option value="">…</option>
      {PRESET_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
    </select>
  </Row>
</Section>
```

> i18n key 若无就用英文字面(库默认字典 enMessages);标签用 presetId 原名即可(fadeIn/slideInLeft/…),v1 不做本地化。选择后 `value` 复位为空,便于连续套用。

- [ ] **Step 2: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。

- [ ] **Step 3: Commit**

```bash
git add packages/editor/src/inspector/Inspector.tsx
git commit -m "$(cat <<'EOF'
feat(editor): animation preset picker in inspector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成判据

- `pnpm -r --parallel typecheck` 0;`pnpm -r --parallel test` 全绿(基线 8 文件 + keyframes/animation-presets/keyframe-ops 新测);`pnpm --filter "@gedatou/*" build` 成功。
- 选中 item → 检查器 6 个 transform 属性各有 ◆:当前播头加/删关键帧、◀▶ 跳帧、有关键帧时改数值即写该帧;时间线选中 item 显示合并关键帧点、可拖拽改时间;预设一键套用。
- 渲染(预览 + 服务端)transform/opacity 随帧插值(带 easing),fade 仍乘法叠加;无关键帧的 item 行为与之前一字不差。
- undo/redo 覆盖所有关键帧操作(拖拽塌成 1 条);刷新/存档保留关键帧。
- 未破坏现有:静态属性编辑、fade 手柄、时间线 move/trim/fade/volume 手势(z 序与 stopPropagation 隔离)。

## 控制器负责的浏览器/渲染验证(不在 subagent 任务内)

- 用 demo(`apps/editor` 或 workbench-v2)冒烟:打关键帧 → 预览随帧动;拖时间线点改时;套预设;undo/redo;不破坏既有手势。
- 抽帧核对:一个 position+opacity 关键帧的 item,若干帧属性值与 `resolveProp` 一致;确认服务端渲染同源。
