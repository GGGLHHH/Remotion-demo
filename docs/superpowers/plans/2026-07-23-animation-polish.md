# Animation 处理好 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 把 `@gedatou/editor` 检查器的 Animation 体验补齐:① 关键帧**读数保真**(数值/opacity 框随播头显示插值值);② Animation 区**名副其实**(去掉 value-less select、加已打关键帧属性汇总+清除)。

**Architecture:** Part A 把 6 个可动画字段的 `value` 从静态 `item[prop]` 改为**每字段级** `usePlayerFrameDerived` 计算的 `kf.has(prop)?resolveProp(item,prop,frameInItem):item[prop]`——非关键帧属性 derive 返回静态值(primitive 不变→不重渲),只让打了关键帧的字段随播头刷新(避免整段每帧重渲的回归)。Part B 把 AnimationSection 的 select 换成"套用预设"菜单按钮 + 列出已打关键帧属性(每个带清除)。

**Tech Stack:** React19 + Zustand · Remotion 4.0.491 · `usePlayerFrameDerived`(canvas/player-ref)· `resolveProp`(@gedatou/shared/composition)· vitest · pnpm。

## Global Constraints

- **每字段级反应式**:读数保真必须**逐字段** `usePlayerFrameDerived`,derive 对非关键帧属性返回静态 `item[prop]`(常量 primitive→不触发重渲),只有 keyframed 字段随帧重渲。**不得**在 section 级用一个 usePlayerFrameDerived 返回对象(每帧新引用→整段重渲,正是键帧那轮修过的回归)。
- **写入路径不变**:onChange 仍走现有 `animPatch`(keyframed→写当前帧关键帧、否则写静态),W/H 仍走 setW/setH/setLinkedDim 的 aspect-lock。只改 value 的**显示**来源。
- **frameInItem** = `clamp(getPlayerFrame() - item.from, 0, item.durationInFrames)`(读时用 usePlayerFrameDerived 的 f;与 KeyframeToggle/animPatch 同基准)。
- 不破坏既有检查器区、fade、transitions 面板。additive/局部。

## Verification Recipe
- `pnpm -F @gedatou/editor typecheck`(0)· `pnpm -r --parallel test`(基线 shared 39 + editor 67 绿)· `pnpm --filter "@gedatou/*" build`(成功)。浏览器/性能核对由控制器统一做。

## File Structure
```
packages/editor/src/inspector/
  AnimatableField.tsx      NEW   AnimatableNumberField / AnimatableSliderField(每字段级反应式 value + KeyframeToggle)   (T1)
  Inspector.tsx            EDIT  LayoutSection/FillSection 6 字段改用 AnimatableField;AnimationSection 重做           (T1,T2)
```

---

## Task 1: 关键帧读数保真(每字段级反应式 value)

**Files:** Create `packages/editor/src/inspector/AnimatableField.tsx`;Modify `packages/editor/src/inspector/Inspector.tsx`(LayoutSection :310-462 的 X/Y/W/H/rotation、FillSection :496-531 的 opacity)

**Interfaces:** Produces `AnimatableNumberField`、`AnimatableSliderField`(封装:每字段级反应式 value + NumberField/SliderField + KeyframeToggle)。

- [ ] **Step 1: AnimatableField.tsx** — 每字段级反应式 value 包装:

```tsx
import type React from 'react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { resolveProp } from '@gedatou/shared/composition';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { NumberField } from './NumberField';
import { SliderField } from './fields';
import { KeyframeToggle } from './KeyframeToggle';
import type { ItemKeyframesApi } from './use-item-keyframes';

// 每字段级:非关键帧属性 derive 返回静态值(常量→不重渲);keyframed 属性随播头插值刷新(仅本字段重渲)
const useAnimatedValue = (item: EditorStarterItem, prop: AnimatableProp, kf: ItemKeyframesApi): number =>
  usePlayerFrameDerived((f) =>
    kf.has(prop)
      ? resolveProp(item, prop, Math.max(0, Math.min(item.durationInFrames, f - item.from)))
      : (item[prop] as number),
  );

export const AnimatableNumberField: React.FC<{
  item: EditorStarterItem; prop: AnimatableProp; kf: ItemKeyframesApi;
  label: string; className?: string; onChange: (v: number, committing: boolean) => void;
}> = ({ item, prop, kf, label, className, onChange }) => {
  const value = useAnimatedValue(item, prop, kf);
  return (
    <div className="flex items-center gap-1">
      <NumberField inline label={label} className={className} value={value} onChange={onChange} />
      <KeyframeToggle item={item} prop={prop} kf={kf} />
    </div>
  );
};

// opacity 走 SliderField(UI 0-100),value 传百分比
export const AnimatableSliderField: React.FC<{
  item: EditorStarterItem; prop: AnimatableProp; kf: ItemKeyframesApi;
  toUi: (v: number) => number; onChange: (uiValue: number) => void;
  // 透传 SliderField 需要的其它 props(label/min/max/...)
  sliderProps: Record<string, unknown>;
}> = ({ item, prop, kf, toUi, onChange, sliderProps }) => {
  const raw = useAnimatedValue(item, prop, kf);
  return (
    <div className="flex items-center gap-1">
      <SliderField {...sliderProps} value={toUi(raw)} onChange={onChange} />
      <KeyframeToggle item={item} prop={prop} kf={kf} />
    </div>
  );
};
```
> 读 `SliderField`/`NumberField` 的实际 props 签名(`./fields`、`./NumberField`),`AnimatableSliderField` 按 opacity 行现有用法适配(现:`value={item.opacity*100}` + `onChange={(v)=>animPatch('opacity',v/100,false)}`)。若 SliderField 透传太别扭,可让 FillSection 直接内联一个 `useAnimatedValue` 局部组件而非通用 wrapper——关键是**每字段级** usePlayerFrameDerived。

- [ ] **Step 2: LayoutSection 6 字段** — 把 X(:392)/Y(:396)/rotation(:439)三个 `<NumberField value={item.xxx} .../> + <KeyframeToggle>` 替换为 `<AnimatableNumberField item={item} prop="left|top|rotation" kf={kf} label=... className=... onChange={(v,c)=>animPatch('left|top|rotation',v,c)} />`。W/H(:406/410 经 setW/setH):把它们的 `value` 也改成 `useAnimatedValue(item,'width'|'height',kf)`(在 LayoutSection 内对 W/H 各调一次——注意 hooks 顺序稳定),onChange 仍走 setW/setH(aspect-lock 不变);KeyframeToggle 保留。
  > 因 W/H 的 onChange 逻辑特殊(联动锁),不套通用 wrapper;只把其 `value` 换成 `useAnimatedValue`(从 AnimatableField.tsx 导出 `useAnimatedValue`)。

- [ ] **Step 3: FillSection opacity** — 把 opacity SliderField(:526)的 `value`(现 `item.opacity*100`)换成 `useAnimatedValue(item,'opacity',kf) * 100`;onChange 不变。KeyframeToggle 保留。

- [ ] **Step 4: 导出 useAnimatedValue** — 从 AnimatableField.tsx `export` `useAnimatedValue` 供 W/H/opacity 就地用。

- [ ] **Step 5: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。

- [ ] **Step 6: Commit**
```bash
git add packages/editor/src/inspector/AnimatableField.tsx packages/editor/src/inspector/Inspector.tsx
git commit -m "$(cat <<'EOF'
feat(inspector): keyframe readout fidelity — fields show resolved value at playhead

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Animation 区名副其实(预设菜单 + 关键帧属性汇总)

**Files:** Modify `packages/editor/src/inspector/Inspector.tsx`(AnimationSection :467-494)

**Interfaces:** Consumes `useItemKeyframes`(`clear`/`applyPreset`/`has`)、`PRESET_IDS`(@gedatou/shared/composition)、现有 `DropdownMenu*`(ui)、`Section`/`Row`/`Button`。

- [ ] **Step 1: 预设菜单按钮** — 把 AnimationSection 里的 `<select>`(value-less、停在"…")换成一个"套用预设"菜单按钮:用现有 `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`(检查器别处已用,确认导入),trigger 是一个 `<Button>` 文案 "套用预设"(i18n key 可复用/新增),菜单项遍历 `PRESET_IDS`,点击 `kf.applyPreset(id)`。动作语义,不再假装回显值。

- [ ] **Step 2: 已打关键帧属性汇总** — 在预设按钮下,遍历 `ANIMATABLE_PROPS`(@gedatou/shared),对 `kf.has(prop)` 为真的属性各渲染一行:属性名 + 一个清除按钮(`kf.clear(prop)`,图标/×)。全部无关键帧时该汇总不显示(或显示一句 "无关键帧")。这样 Animation 区反映 item 的动画状态。

```tsx
// 伪结构
<Section title={t('inspector.animation') ?? 'Animation'}>
  <Row label={t('inspector.preset') ?? 'Preset'}>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="ghost">{t('inspector.applyPreset') ?? 'Apply preset'} ▾</Button>} />
      <DropdownMenuContent>
        {PRESET_IDS.map((id) => <DropdownMenuItem key={id} onClick={() => kf.applyPreset(id)}>{id}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </Row>
  {ANIMATABLE_PROPS.filter((p) => kf.has(p)).map((p) => (
    <Row key={p} label={p}>
      <Button size="icon-xs" variant="ghost" aria-label={`clear ${p} keyframes`} onClick={() => kf.clear(p)}><X/></Button>
    </Row>
  ))}
</Section>
```
> 确认 `DropdownMenu*` 的实际 API(trigger 是 `render` prop 还是 children;检查器 status/visibility 菜单的用法为准)、`ANIMATABLE_PROPS` 导出、`Button` 的 size 变体、图标来源(lucide `X`)。i18n 新 key 加到 en.ts(带 fallback)。

- [ ] **Step 3: 验证** — editor typecheck 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。

- [ ] **Step 4: Commit**
```bash
git add packages/editor/src/inspector/Inspector.tsx packages/editor/src/locales/en.ts
git commit -m "$(cat <<'EOF'
feat(inspector): animation section — preset menu + keyframed-props summary with clear

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成判据
- `pnpm -r --parallel typecheck` 0;`pnpm -r --parallel test` 全绿;`pnpm --filter "@gedatou/*" build` 成功。
- 选中 keyframed item、拖播头:X/Y/W/H/rotation/opacity 字段**数值随播头变化**(显示插值值);无关键帧的属性字段仍显静态值、**拖播头不重渲**(每字段级隔离)。
- Animation 区:预设是"套用预设 ▾"菜单(不再 value-less select);列出已打关键帧的属性,各可一键清除。
- 未破坏:静态编辑、写关键帧、W/H aspect-lock、fade、transitions 面板。
