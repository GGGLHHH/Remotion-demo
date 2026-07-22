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
