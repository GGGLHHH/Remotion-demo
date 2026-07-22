# 关键帧动画机制设计(v1)

- 日期:2026-07-22
- 范围:`@gedatou/shared`(数据模型 + 合成插值 + 预设生成器,纯)+ `@gedatou/editor`(命令 + 检查器 ◆ + 时间线关键帧轨)
- 定位:这是库「走过北极星」后的**第一个通用编辑原语**——官方 editor-starter 本身没有关键帧,本设计让库越过它。判据:关键帧是通用编辑原语(需 hook 进库的 transform/合成器/timeline,做不成 custom item),故 first-class 进库。

## 1. 背景与目标

行业横评(5 大编辑器家族)一致把「逐属性关键帧动画」列为当前 8 类模型的**头号缺口 = 最大杠杆**:一个通用机制解锁运动路径、万物动画、入场出场预设、速度曲线。现状库里零关键帧代码;合成器 `ItemPositioner`(`packages/shared/src/composition/ItemRenderer.tsx`)已在 `Sequence` 内(frame 0 = item 起点)用 `interpolate(frame, …)` 做 fade——这是关键帧插值天然的挂载点。

**v1 成功标准**:选中一个 item,能在检查器对 position/scale/rotation/opacity 打关键帧、在时间线看到并拖动关键帧、渲染时属性随帧插值(带 easing),一键套用几个常用动画预设;全部进 undo/持久化;不破坏现有 fade。

## 2. v1 范围(已与用户对齐)

| 维度 | 决定 |
|---|---|
| 可动画属性 | 核心 transform:`left` `top` `width` `height` `rotation` `opacity`(底层机制通用,先开放这 6) |
| 缓动 | 每关键帧一个预设枚举:`linear` `easeIn` `easeOut` `easeInOut` `hold` |
| 交互 | 检查器每属性 ◆ 按钮 + 时间线选中 item 的关键帧轨(可拖拽改时间) |
| 预设 | 一小组常用:淡入 / 淡出 / 滑入(4 方向)/ 放大入(pop)/ 缩小出 |
| fade 关系 | 保留独立,乘法叠加在 opacity 之上 |

## 3. 数据模型(方案 A:就地挂 item)

新增类型(`packages/shared/src/types.ts`):

```ts
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
export type Keyframe = { frame: number; value: number; easing: KeyframeEasing };
// frame 相对 item 起点(0 = item.from),与 fade 同基准;范围 [0, durationInFrames]
export type AnimatableProp = 'left' | 'top' | 'width' | 'height' | 'rotation' | 'opacity';
export const ANIMATABLE_PROPS: readonly AnimatableProp[] = ['left','top','width','height','rotation','opacity'];
```

加到 `BaseItem`:

```ts
/** 稀疏:只在打了关键帧的属性上存;每条数组按 frame 升序、frame 唯一 */
keyframes?: Partial<Record<AnimatableProp, Keyframe[]>>;
```

**方案对比**:
- **A(选)就地挂 item**——稀疏、可 JSON、随 `UndoableState.items` 白拿 undo/持久化;item 删除关键帧跟着死(无孤儿);复制/粘贴 item 天然带上动画。
- B(不选)`UndoableState` 单开 `keyframes[itemId][prop]` 平行结构——删除/复制/粘贴都要手动同步,徒增记账,还会产生孤儿。

**值语义**:某属性 `keyframes[prop]` 非空 → 渲染以关键帧为准、**忽略静态 `item[prop]`**;首次对该属性打关键帧时,用当前静态值播下第一个关键帧(对齐 CapCut/AE)。清空该属性关键帧后回退到静态值。

**迁移**:`keyframes` 可选,旧存档天然兼容(无字段 = 无动画),无迁移代码。

## 4. 渲染插值(复用现有逐帧基建)

在 `@gedatou/shared` 新增纯函数(`packages/shared/src/composition/keyframes.ts`):

```ts
// easing 枚举 → Remotion Easing 函数
easingFn(e: KeyframeEasing): (t: number) => number
// linear→(t)=>t; easeIn→Easing.in(Easing.cubic); easeOut→Easing.out(Easing.cubic);
// easeInOut→Easing.inOut(Easing.cubic); hold→阶跃(见下,不走 interpolate)

// 解析某属性在某帧的值
resolveProp(item: EditorStarterItem, prop: AnimatableProp, frame: number): number
```

`resolveProp` 规则:
- 无 `item.keyframes?.[prop]` 或空数组 → 返回静态 `item[prop]`。
- 1 个关键帧 → 返回其 `value`。
- 多个:`frame ≤ kf[0].frame` → `kf[0].value`(clamp);`frame ≥ kf[last].frame` → `kf[last].value`(clamp);否则定位所在段 `[kf[i], kf[i+1]]`:
  - `kf[i].easing === 'hold'` → 返回 `kf[i].value`(阶跃,直到下一关键帧);
  - 否则 `interpolate(frame, [kf[i].frame, kf[i+1].frame], [kf[i].value, kf[i+1].value], { easing: easingFn(kf[i].easing), extrapolate*: 'clamp' })`。
  - 段的 easing 取**出向关键帧**(`kf[i]`)的 easing。

改造 `ItemPositioner`(`ItemRenderer.tsx`):把读取 `item.left/top/width/height/rotation/opacity` 改为 `resolveProp(item, prop, frame)`(`frame = useCurrentFrame()`,已是 item 内相对帧)。**fade 保持不变**,最终:

```
opacity 输出 = resolveProp(item,'opacity',frame) × fadeIn(frame) × fadeOut(frame)
```

(与现有 `item.opacity * fadeIn * fadeOut` 一脉相承,只是 opacity 项变成时变。)

`resolveProp` 属性无关、`AnimatableProp` 底层是 string,未来放开 crop/volume/TextStyle/`custom.data` 数值只需扩白名单 + UI 暴露,插值机制不改。

## 5. 授权 API / 命令(`@gedatou/editor`,对齐命令式风格)

全部走 `updateUndoable`(高频拖拽 `commit:false` + 松手 `commitPending`,与现有编辑一致)。关键帧数组写入后**保持 frame 升序、frame 唯一**(同帧再加 = 覆盖)。

```ts
toggleKeyframe(itemId, prop, frame)                  // ◆ 按钮:该帧有则删、无则加(值=当前 resolveProp)
addKeyframe(itemId, prop, frame, value?, easing?)    // value 省略=当前 resolveProp;easing 默认 'easeInOut'
removeKeyframe(itemId, prop, frame)
setKeyframeValue(itemId, prop, frame, value)         // 检查器改值即写该帧
setKeyframeEasing(itemId, prop, frame, easing)
moveKeyframe(itemId, prop, fromFrame, toFrame)       // 时间线拖拽;clamp 到 [0,dur],冲突帧合并
clearKeyframes(itemId, prop)                          // 该属性回退静态值
applyAnimationPreset(itemId, presetId)               // 见 §7
```

playhead 当前帧由 Player 提供(`useEditorRefs().player` / store);检查器 ◆ 用 `frameInItem = playhead − item.from`(clamp [0,dur])定位。

## 6. UI

**检查器**(`@gedatou/editor` inspector):每个可动画属性行右侧一个 ◆ 状态按钮:
- 该属性无任何关键帧 → 空心 ◆(点=在当前帧开启,播下首帧=当前静态值)。
- 有关键帧、当前帧无 → 空心 ◆ + `◀ ▶`(跳上/下一关键帧);点 ◆ = 在当前帧加。
- 有关键帧、当前帧正好有 → 实心 ◆(点=删该帧)。
- 属性行有关键帧时高亮;数值输入框的 `onChange` 分支:该属性**有关键帧→写当前帧关键帧**(`setKeyframeValue`,当前帧无则 `addKeyframe`);**无关键帧→改静态值**(现状不变)。

**时间线**(`@gedatou/editor` timeline):选中 item 的行上叠加一条**合并关键帧轨**——在"任意属性有关键帧"的帧位画一个点(frame→x 绝对定位);水平拖拽一个点 = `moveKeyframe` 该帧上所有属性的关键帧一起挪(松手提交)。**加法式叠加,不改 Timeline 交互本体**(呼应记忆里"Timeline 不拆")。逐属性展开留 v2。

## 7. 预设(建在裸关键帧之上,纯生成器)

`packages/shared/src/composition/animation-presets.ts`:纯函数 `buildPreset(presetId, item): Partial<Record<AnimatableProp, Keyframe[]>>`,`applyAnimationPreset` 命令写入结果(覆盖涉及属性的现有关键帧)。`D = Math.min(Math.round(fps * 0.5), Math.floor(dur / 3))`(默认动画时长,至少 1)。

| presetId | 写什么 |
|---|---|
| `fadeIn` | opacity `[{0,0,easeOut},{D,1,linear}]` |
| `fadeOut` | opacity `[{dur-D,1,easeIn},{dur,0,linear}]` |
| `slideIn{Left/Right/Top/Bottom}` | left 或 top:`[{0, 起点(屏外偏移 ±width/height), easeOut},{D, item.left/top, linear}]` + opacity `[{0,0,easeOut},{D,1}]` |
| `zoomIn` (pop) | width/height `[{0,0,easeOut},{D, item.w/h}]` + opacity 淡入 |
| `zoomOut` | width/height `[{dur-D, item.w/h, easeIn},{dur,0}]` + opacity 淡出 |

预设与 fade 手柄是替代关系(都能做淡入),用户择一;不禁止并用(乘法叠加,后果用户自负)。

## 8. 持久化 / undo

`keyframes` 是 `UndoableState.items[id]` 的一部分 → 快照栈白拿 undo/redo/持久化。拖拽类命令沿用"起始快照 + `commit:false`,松手 `commitPending`"。无独立存储、无迁移。

## 9. v1 明确不做(留坑)

- 贝塞尔曲线 / 图表(值-速度图)编辑器 —— easing 只给预设枚举。
- 画布运动路径 UI(position 关键帧数据已具备,曲线可视化/拖拽留 v2)。
- transform 以外属性(crop/volume/TextStyle/custom.data)—— 机制已通用,v1 不放开白名单。
- 表达式 / 属性联动 / 父子变换绑定。
- 时间线逐属性展开轨(v1 只合并轨)。

## 10. 测试

- **纯函数(shared,vitest)**:`easingFn` 五枚举;`resolveProp`——无关键帧回退静态、单关键帧、段内插值(各 easing)、`hold` 阶跃、边界外 clamp、frame 升序假设;`buildPreset` 各预设产出结构与端点值。
- **命令(editor,vitest 对 store)**:toggle/add/remove(保持升序+唯一)、setValue/setEasing、move(clamp+冲突合并)、clear(回退静态)、applyPreset(覆盖语义)。
- **渲染(e2e / 抽帧)**:对一个打了 position+opacity 关键帧的 item,抽取若干帧断言画布属性值随帧变化且与 `resolveProp` 一致;确认 fade 仍乘法叠加。

## 11. 文件落点

```
packages/shared/src/
  types.ts                                  += KeyframeEasing/Keyframe/AnimatableProp/ANIMATABLE_PROPS + BaseItem.keyframes
  composition/keyframes.ts        (NEW)     easingFn + resolveProp (+ test)
  composition/animation-presets.ts (NEW)    buildPreset (+ test)
  composition/ItemRenderer.tsx    (EDIT)    ItemPositioner 用 resolveProp;opacity 叠 fade
packages/editor/src/
  <state/命令层>                  (EDIT)     toggle/add/remove/setValue/setEasing/move/clear/applyPreset (+ test)
  <inspector>                     (EDIT)     属性行 ◆ 状态按钮 + 数值框分支写关键帧
  <timeline>                      (EDIT)     选中 item 合并关键帧轨 + 拖拽 moveKeyframe
  公开 API/类型导出               (EDIT)     导出新命令与类型
```
(具体文件由 writing-plans 探索后精确到行。)

## 12. 风险 / 待决

- 检查器数值框"有关键帧则写帧、否则写静态值"的分支,需保证不误伤现有静态编辑路径(现有 `useItemPatch` 语义)。
- 时间线合并轨的命中区/拖拽与既有 item 拖拽/修剪手势不冲突(z 序、事件冒泡)。
- `resolveProp` 进渲染热路径(每 item 每帧每属性一次):需保证无关键帧时零额外开销(提前 return 静态值)。
- 预设 `slideIn` 的"屏外起点"取 `±width/height` 偏移即可,不需要合成尺寸;若要真正"划出屏幕"可用合成宽高,v1 用 item 尺寸偏移足够。
