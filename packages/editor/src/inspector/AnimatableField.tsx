import type React from 'react';
import type { AnimatableProp, EditorStarterItem } from '@gedatou/shared';
import { resolveProp } from '@gedatou/shared/composition';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { NumberField } from './NumberField';
import { KeyframeToggle } from './KeyframeToggle';
import type { ItemKeyframesApi } from './use-item-keyframes';

/**
 * 每字段级反应式读数:无关键帧的属性 derive 返回静态 item[prop](原始类型不变→usePlayerFrameDerived
 * 不重渲这个字段);打了关键帧的属性随播放头插值,只有这一个字段重渲,不牵动整个检查器分区。
 */
export const useAnimatedValue = (
  item: EditorStarterItem,
  prop: AnimatableProp,
  kf: ItemKeyframesApi,
): number =>
  usePlayerFrameDerived((f) =>
    kf.has(prop)
      ? resolveProp(item, prop, Math.max(0, Math.min(item.durationInFrames, f - item.from)))
      : (item[prop] as number),
  );

/**
 * NumberField + KeyframeToggle,value 换成上面的每字段反应式读数。
 * 供 X/Y/rotation 用;W/H 的 onChange 走联动锁(setW/setH),不套这个壳,直接在
 * LayoutSection 里调 useAnimatedValue 换 value 即可。
 */
export const AnimatableNumberField: React.FC<
  Omit<React.ComponentProps<typeof NumberField>, 'value'> & {
    item: EditorStarterItem;
    prop: AnimatableProp;
    kf: ItemKeyframesApi;
  }
> = ({ item, prop, kf, ...fieldProps }) => {
  const value = useAnimatedValue(item, prop, kf);
  return (
    <>
      <NumberField {...fieldProps} value={value} />
      <KeyframeToggle item={item} prop={prop} kf={kf} />
    </>
  );
};
