# 转场(Transitions)v1 设计

- 日期:2026-07-23
- 范围:`@gedatou/shared`(数据模型 + 纯渲染 seam + z 序修正)+ `@gedatou/editor`(命令 + 时间线切点 UX + 检查器面板 + 选择)
- 定位:「走过北极星」的第二个通用编辑原语(官方 editor-starter 把转场列为"未来 @remotion/transitions 升级路径、从未落地")。
- 设计来源:3 方案 workflow → 评审决定性选 **方案 B(自定义重叠 + 透明度交叉淡化)**,否决 TransitionSeries 方案(赌 Remotion 非公开内部布局、跨轨时序错位、2-3 周)。

## 1. 背景与核心洞察

现有渲染是**自由排布多轨**:每个 item 独立 `<Sequence from durationInFrames>`,可重叠/留空;`getOrderedItems` 按轨道 bottom→top 摊平;`calcDuration=max(from+dur)`。`@remotion/transitions` 的 `<TransitionSeries>` 是无缝顺序系列,和自由模型不兼容。

**核心洞察:自由模型本就渲染重叠——转场无非是"两个相邻片段之间的重叠区 + 定义该重叠区如何混合"。** v1 的混合 = 交叉淡化(A 淡出、B 淡入),恰好归结为 `ItemPositioner` 已经在算的 opacity 乘子。于是转场**不需要新渲染范式、不加依赖、不重构渲染树**。

## 2. v1 范围(采纳评审推荐默认)

- **只做交叉淡化(fade / cross-dissolve)**;`type` 字段留单成员联合,v2 加 slide/wipe 零迁移。
- **同轨 + 恰好相邻**:`+` 入口只在 `a.from + a.durationInFrames === b.from` 的切点出现。
- **单条记录,但链式多切点隐式成立**(一个 item 既可是某转场的 fromItem 又是另一转场的 toItem;乘子天然处理淡入×淡出),无 "run" 抽象。
- **建转场 = 真实左移 B**;**v1 不 ripple**,B 后面留诚实空档(自由模型允许)。
- **渲染自愈**到 live 重叠 = `min(存储时长, live重叠)`。
- **移除转场 = 硬切**(B 留在原位)。
- **z 序**:`getOrderedItems` 每轨按 from 升序(交叉淡化需入场片段在上)。

## 3. 数据模型

`packages/shared/src/types.ts`:

```ts
export type TransitionType = 'fade'; // 单成员联合,v2 加 'slide'|'wipe'… 零迁移
export type Transition = {
  id: string;
  trackId: string;
  fromItemId: string; // 出场(A)
  toItemId: string;   // 入场(B)
  type: TransitionType;
  durationInFrames: number;
};
```

`UndoableState` 加顶层键 `transitions: Record<string, Transition>`(与 `items`/`assets` 平行)。

**不变量**(创建/编辑时维护,非类型系统强制):同轨;创建瞬间 `toItem.from === fromItem.from + fromItem.durationInFrames − durationInFrames`(即 A、B 因本转场恰好搭接 `durationInFrames` 帧);每 item 至多被一个转场引用为 fromItemId、至多一个为 toItemId(每轨转场构成简单链、无分叉)。

**迁移**:`transitions` 顶层可选,`createEmptyState` 初始化 `{}`,反序列化 load-shim `parsed.transitions ??= {}`(与现有 `normalizeLegacyFades` 同款)。**不加任何 BaseItem 字段**——7 种既有 item 零迁移风险。

## 4. 渲染(shared,纯,预览/服务端同一条路径)

新 `packages/shared/src/composition/transitions.ts`(纯函数、可服务端、无 React):

```ts
// item 在某帧因转场获得的乘子;无转场提前 return {opacity:1}(零开销)
export const getTransitionRenderProps = (
  state: UndoableState, item: EditorStarterItem, frame: number,
): { opacity: number } => { /* 见下规则 */ };
```

规则(`frame` = `useCurrentFrame()`,即 Sequence 内相对帧,需换算到合成绝对帧或按 item 相对——**注意基准**见 §7):
- 遍历 `state.transitions`;`state.transitions` 空则直接 `{opacity:1}`。
- item 作为 **toItemId**(入场):在其**开头**的 live 重叠窗口内 opacity 由 0 ramp 到 1。
- item 作为 **fromItemId**(出场):在其**结尾**的 live 重叠窗口内 opacity 由 1 ramp 到 0。
- 两者相乘(mid-chain item 同时淡入+淡出)。
- **live 重叠自愈**:`liveOverlap = max(0, (fromItem.from + fromItem.durationInFrames) − toItem.from)`;`d = min(transition.durationInFrames, liveOverlap)`;`d ≤ 0` → 该转场对本 item 无效(no-op)。ramp 用现有 `interpolate`(clamp)。

`ItemPositioner`(`ItemRenderer.tsx`)opacity 那行(现 `baseOpacity * fadeIn * fadeOut`)改为:

```tsx
opacity: baseOpacity * fadeIn * fadeOut * getTransitionRenderProps(ctx.state, item, frame).opacity
```

> 返回**对象** `{opacity}`(非裸 number)是 seam:v2 加 `transform?`/`clipPath?` 做 slide/wipe 时不再动 ItemRenderer。

**z 序修正**(`ordering.ts`):每轨内 items 先按 `from` 升序再 push——后开始的入场片段在重叠时画在上层(交叉淡化需定义 z 序)。已核对只影响同轨重叠的绘制顺序,不破坏 `ordering.test.ts`(它只断言跨轨顺序)。

预览与服务端都走同一 `MainComposition`/`ItemPositioner`,**行为按构造一致**(不 fork 任何路径)。

## 5. 时长/时间模型(关键拍板)

**建转场做一件实事:把 B.from 左移 `durationInFrames`**,让 A、B 真重叠。于是:
- 时间轴块的重叠 = 混合发生处(所见即所得)。
- `calcDuration` 的 `max(from+dur)` 天然反映缩短(B.end 减小),**零改动**。
- **v1 不 ripple**:B 之后的 items 不动,留一个 `durationInFrames` 帧的诚实空档。
- **移除转场 = 硬切**:只删记录,B 留原位(重叠处 B 在上=视觉硬切;A 尾部 D 帧被盖住)。
- **自愈**:存储时长从不被盲信;渲染每帧按 live 几何重算,任何"转场无关"的 trim/move 只缩短/失效淡化,绝不"对着空气淡"。

## 6. 编辑侧(`@gedatou/editor`)

**命令**(`lib/transition-ops.ts` 或并入现有 ops,imperative store,可单测):
- `applyTransitionDuration(state, id, dur)` 共享 helper:夹 `[1, min(aDur,bDur)]`,并据此重算 B.from(=A.end − dur)。
- `addTransition(store, fromItemId, toItemId)`:原子 `updateUndoable`(单 undo)——`dur = min(DEFAULT≈12, aDur, bDur)`,`B.from -= dur`,插入记录。
- `removeTransition(store, id)`:删记录(B 不动)。
- **孤儿清理**:删 item 时删引用它的转场——集中在**单一删除路径**(`commands.ts` deleteSelected)。渲染自愈覆盖位置漂移,无需每次 commit 的 reconcile 全扫。

**选择**:新增临时(非 undoable)`selectedTransitionId`,与 `selectedItemIds` 互斥。

**时间线 UX**(`TimelinePanel`):复用现有相邻检测(`rowItems.find(o => o.from === a.from + a.durationInFrames)`):
- 无转场 → 悬停出 `+` 徽章;点 = `addTransition`(单 undo)。
- 有转场 → 跨 `dur*zoom` px 居中于切点的实心 pill,可拖拽调时长(复用 fade-pill/volume 的 `startHandleDrag` commit:false 流 + `commitPending`),夹 `[1,min(aDur,bDur)]` 用同一 helper。
- 选中 pill → `selectedTransitionId`;Delete/Backspace 删除(`useShortcuts` 加一分支)。
- `ItemBlock` **无需几何改动**(它本就按 left/width 渲染重叠)。

**检查器 UX**(`Inspector.tsx`):`selectedTransitionId` 存在时走一个薄 `TransitionPanel`:静态 "Cross Dissolve" 标签(单类型、无选择器)+ 一个时长字段(`useTransitionPatch(id)` 调**同一** clamp helper,字段与拖拽永不打架)+ 移除按钮。

## 7. 关键实现注意 / 待决

- **帧基准**:`ItemPositioner` 里 `frame = useCurrentFrame()` 是 **Sequence 内相对帧**(0 = item.from)。而 `getTransitionRenderProps` 判断重叠需**合成绝对帧**或按 item 相对换算。实现时统一:传绝对帧 `item.from + useCurrentFrame()`,或在函数内把窗口换算成 item 相对帧([0,d] 为入场淡入、[dur−d,dur] 为出场淡出)。**这是唯一容易出错处,plan 要钉死。**
- **双 alpha "暗一下"**:交叉淡化中点两条独立 opacity ramp over 黑底 → 亮度短暂下陷(与 @remotion/transitions fade() 同款近似)。v1 可接受,v2 升真像素/mix-blend。
- **pill 视觉新鲜度 ≠ 渲染正确性**:渲染自愈到 live 重叠,但 pill 宽度显示存储时长,用户用"转场无关"手势 trim/move A/B 后 pill 可能视觉漂移到再次触碰。v1 诚实缺口;彻底修 = 让 move/trim 转场感知(deferred)。
- **sort-by-from z 序**:改的是**所有**同轨既有重叠的绘制顺序。已核对不破坏 ordering.test.ts;合并前 grep 有无 demo/fixture 依赖当前偶然绘制顺序。

## 8. v1 明确不做(留口)

- wipe/slide/flip/clockWipe 等**空间型**转场(`{opacity}` seam 已为 transform/clipPath 留口;空间原语是真新活)。
- **ripple**(建/删转场时把下游同轨 items 一起挪)——留作后续 opt-in 开关。
- 跨轨转场;非相邻/带 gap 的转场;转场自身的 easing 曲线编辑(v1 用线性 ramp)。
- 真像素混合(消除双 alpha 暗场)。

## 9. 测试

- **纯函数(shared,vitest)**:`getTransitionRenderProps`——入场 0→1 端点、出场 1→0 端点、mid 值、mid-chain 淡入×淡出相乘、live 重叠自愈(缩短/失效)、无转场提前返回 1;帧基准换算正确。
- **z 序(shared)**:`ordering` 每轨按 from 升序,后开始者在后(画在上);不破坏既有跨轨断言。
- **命令(editor,vitest 对 store)**:addTransition(B.from 左移正确、单 undo、dur clamp)、applyTransitionDuration(clamp + B.from 重算)、removeTransition(B 不动)、孤儿清理(删 item 连带删转场)。
- **渲染 e2e / 抽帧**:两片段带 fade 转场,抽重叠区若干帧断言 A opacity 降、B opacity 升、非重叠区各为 1;确认服务端渲染同源。

## 10. 文件落点

```
packages/shared/src/
  types.ts                          += TransitionType/Transition + UndoableState.transitions
  factories.ts / state 初始化        += createEmptyState transitions:{}  + 反序列化 load-shim
  composition/transitions.ts   NEW  getTransitionRenderProps (+ test)
  composition/ItemRenderer.tsx EDIT ItemPositioner opacity 乘 seam
  composition/ordering.ts      EDIT 每轨 sort by from (+ test)
packages/editor/src/
  lib/transition-ops.ts        NEW  applyTransitionDuration/addTransition/removeTransition (+ test)
  lib/commands.ts / deleteSelected EDIT 孤儿清理
  state/store.ts               EDIT selectedTransitionId(临时,非 undoable)+ setter
  timeline/TimelinePanel.tsx   EDIT 切点 + 徽章 / pill / 拖拽 / 选中
  inspector/Inspector.tsx      EDIT selectedTransitionId 分支 → TransitionPanel + useTransitionPatch
  lib/shortcuts (useShortcuts) EDIT Delete 分支
  index.ts                     EDIT 导出转场命令 + 类型
```
(具体到行由 writing-plans 探索后钉死,尤其帧基准与 TimelinePanel 切点循环。)
