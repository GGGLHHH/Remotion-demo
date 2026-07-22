# 转场预设 v2(Slide / Wipe / Zoom)设计

- 日期:2026-07-23
- 范围:`@gedatou/shared`(数据模型 + 纯渲染扩展 + 预设表)+ `@gedatou/editor`(命令 + 检查器预设菜单)
- 定位:转场 v1(仅交叉淡化)的第一次富化——加空间型转场,并把检查器做成"预设可选"。承接 v1 明确留的扩展口。
- 前置:v1 已实现(见 `2026-07-23-transitions-design.md`);本设计经 brainstorming 对齐,用户选定 **Slide + Wipe + Zoom**。

## 1. 核心洞察

v1 的 `getTransitionRenderProps` 已返回**对象** `{opacity}`——正是为此留的 seam。Slide/Wipe/Zoom 全部是 **per-item 的 transform / clipPath / opacity**,不需要在两片段间插合成层、不改渲染范式、不加依赖,和 v1 一个模子。

关键实现事实(已核对 `ItemRenderer.tsx`):`ItemPositioner` 用 CSS **独立变换属性** `rotate: '<n>deg'`(非 `transform` 字符串)。因此转场可以直接返回**独立 CSS 属性** `translate` / `scale` / `clipPath`,它们与既有 `rotate` **自动合成**(CSS 个体变换顺序 translate→rotate→scale),无需手工拼 transform 串。这是本设计最干净的一点。

## 2. 数据模型(加法、零迁移)

`packages/shared/src/types.ts`:

```ts
export type TransitionType = 'fade' | 'slide' | 'wipe' | 'zoom';
export type TransitionDirection = 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
export type Transition = {
  id: string;
  trackId: string;
  fromItemId: string;
  toItemId: string;
  type: TransitionType;         // v1 是单成员 'fade';这里加宽
  direction?: TransitionDirection; // slide/wipe 用 4 方向;zoom 用 in/out;fade 无
  durationInFrames: number;
};
```

**迁移**:`type` 加宽(旧数据全是 `'fade'`,合法);`direction` 可选(旧数据无 → fade 忽略之)。`transitions ??= {}` load-shim 已在。**零迁移风险**。

## 3. 预设表(shared,新 `composition/transition-presets.ts`)

像 keyframe 的 `PRESET_IDS`——一张纯数据表,渲染器与检查器共用:

```ts
export type TransitionPreset = { id: string; type: TransitionType; direction?: TransitionDirection; label: string };
export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
  { id: 'fade',        type: 'fade',                       label: 'Cross Dissolve' },
  { id: 'slide-left',  type: 'slide', direction: 'left',   label: 'Slide Left' },
  { id: 'slide-right', type: 'slide', direction: 'right',  label: 'Slide Right' },
  { id: 'slide-up',    type: 'slide', direction: 'up',     label: 'Slide Up' },
  { id: 'slide-down',  type: 'slide', direction: 'down',   label: 'Slide Down' },
  { id: 'wipe-left',   type: 'wipe',  direction: 'left',   label: 'Wipe Left' },
  { id: 'wipe-right',  type: 'wipe',  direction: 'right',  label: 'Wipe Right' },
  { id: 'wipe-up',     type: 'wipe',  direction: 'up',     label: 'Wipe Up' },
  { id: 'wipe-down',   type: 'wipe',  direction: 'down',   label: 'Wipe Down' },
  { id: 'zoom-in',     type: 'zoom',  direction: 'in',     label: 'Zoom In' },
  { id: 'zoom-out',    type: 'zoom',  direction: 'out',    label: 'Zoom Out' },
] as const;

// 反查:transition 的 (type,direction) → preset(检查器回显当前预设名/高亮)
export const presetIdOf = (t: Pick<Transition, 'type' | 'direction'>): string => /* 匹配返回 id,兜底 'fade' */;
```

## 4. 渲染扩展(shared,纯函数)

`getTransitionRenderProps` 返回类型从 `{opacity}` 扩为:

```ts
export type TransitionRenderProps = { opacity: number; translate?: string; scale?: string; clipPath?: string };
```

规则(沿用 v1 的重叠窗口 + live 自愈 `d = min(stored, liveOverlap)`;`p` = 该 item 在窗口内的进度,入场 0→1、出场用其结尾窗口):

- **fade**(不变):入场 opacity 0→1;出场 1→0。translate/scale/clipPath 不设。
- **slide / 推**(方向 = 入场进入方向;出场被推向反侧,双方 opacity 保持 1):
  - 入场:`translate` 从 `±100% 0` / `0 ±100%`(据方向)→ `0 0`。
  - 出场:`translate` 从 `0 0` → 反向 `∓100% 0` / `0 ∓100%`。
  - 约定:`slide-left` = 新内容从右侧进入、旧内容被推向左(即视觉上"向左滑")。right/up/down 类推。
- **wipe / 擦**(入场被 clipPath 从某边揭开;出场不动,靠 z 序入场在上盖住):
  - 入场:`clipPath: inset(...)`,遮挡边从 100%→0。`wipe-left` = 从左边揭开(右 inset 100%→0)。
  - 出场:不设(保持整幅)。
- **zoom / 缩**(入场 scale + 淡入,出场反向 scale + 淡出):
  - `zoom-in`:入场 `scale` 0.6→1 + opacity 0→1;出场 `scale` 1→1.2 + opacity 1→0。
  - `zoom-out`:入场 `scale` 1.2→1 + opacity 0→1;出场 `scale` 1→0.8 + opacity 1→0。

`ItemPositioner`(`ItemRenderer.tsx`)把返回对象铺进 style:`opacity *= tp.opacity`,并新增 `translate: tp.translate`、`scale: tp.scale`、`clipPath: tp.clipPath`(与既有 `rotate` 自动合成;undefined 即无效果,fade 路径行为字节不变)。

> ramp 全用现有 `interpolate`(clamp)。多转场(mid-chain item 同时入场+出场)乘子/属性各自独立可叠(opacity 相乘;translate/scale 取当前生效那个转场——一个 item 在某帧至多受一个转场的入场或出场影响,和 v1 相同)。

## 5. 已知取舍(文档化、接受)

- `translate 100%` / `scale` 相对**片段自身盒**(CSS 特性),transform-origin 默认 center。满幅片段(封面、整条视频)= 满帧滑/缩,即常见情形;子帧 item 按自身盒。要"按帧宽滑"是后续(需把帧尺寸传进渲染 props)。
- wipe 出场不裁(入场盖住即可),是标准"新片擦入"观感;双向对擦是后续。
- zoom/slide 的曲线用线性 ramp(无 per-转场 easing),与 v1 一致。

## 6. 编辑侧(`@gedatou/editor`)

- **命令** `lib/transition-ops.ts` 加 `applyTransitionPreset(store, id, presetId)`:据 `TRANSITION_PRESETS` 找到 preset,原子 `updateUndoable` 写 `type` + `direction`(direction 为空时删除该键,保持 fade 干净);**no-op 守卫**(type+direction 未变则返回原引用,不污染 undo)。add/applyDuration/remove 不变。
- **检查器** `inspector/Inspector.tsx` 的 `TransitionPanel`:把静态 `Cross Dissolve` 标签换成**预设菜单**——复用 animation-polish 刚落地的 `Popover`/`PopoverTrigger render={<Button>}`/`PopoverContent` 写法,trigger 显示当前预设 label(`presetIdOf` 反查),菜单遍历 `TRANSITION_PRESETS` → `applyTransitionPreset(id, presetId)` + 关菜单。时长框、移除按钮保留。
- **建转场 UX 不变**:时间线 seam-click 仍建默认(fade);用户在检查器换预设。
- **导出** `index.ts`:补 `applyTransitionPreset`、`TRANSITION_PRESETS`/`TransitionPreset`/`TransitionType`/`TransitionDirection`、扩展后的 `TransitionRenderProps` 类型。

## 7. 测试

- **纯函数(shared,vitest)**:`getTransitionRenderProps` 对每 preset(fade/slide×4/wipe×4/zoom×2)在窗口**首/中/尾**断言入场与出场的 opacity/translate/scale/clipPath 端点值;fade 路径断言 translate/scale/clipPath 均 undefined(不回归);无转场提前返回 `{opacity:1}`;live 重叠自愈仍成立。
- **预设表**:`TRANSITION_PRESETS` 形状/唯一 id;`presetIdOf` 反查(含未知 type+direction 兜底 'fade')。
- **命令(editor,对 store)**:`applyTransitionPreset` 写 type+direction 正确、fade 预设清掉 direction、no-op 守卫返回原引用。
- **回归**:v1 的 `transitions.test.ts`(6)与 `transition-ops.test.ts`(4)保持绿(fade 行为不变)。

## 8. 文件落点

```
packages/shared/src/
  types.ts                          += TransitionType 加宽 + TransitionDirection + Transition.direction
  composition/transition-presets.ts NEW  TRANSITION_PRESETS + TransitionPreset + presetIdOf (+ test)
  composition/transitions.ts        EDIT getTransitionRenderProps 返回 {opacity,translate?,scale?,clipPath?} (+ test 扩)
  composition/ItemRenderer.tsx      EDIT ItemPositioner 铺 translate/scale/clipPath
  index.ts                          EDIT 导出新类型/预设表
packages/editor/src/
  lib/transition-ops.ts             EDIT applyTransitionPreset (+ test)
  inspector/Inspector.tsx           EDIT TransitionPanel 预设菜单(Popover)
  index.ts                          EDIT 导出 applyTransitionPreset + 类型
```

## 9. v2 明确不做(留口)

- 沾色转场(dip to black/white,需两片段间黑/白合成层)。
- 按帧宽滑动(需把帧尺寸传进渲染 props)、双向对擦、per-转场 easing 曲线、旋转/翻转/时钟擦除等更多类型。
- 建转场时直接选类型(v1 建默认 fade + 检查器换预设的两步流程不变)。
