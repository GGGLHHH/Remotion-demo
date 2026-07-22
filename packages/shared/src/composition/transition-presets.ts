import type { Transition, TransitionDirection, TransitionType } from '../types';

// 转场预设:一张纯数据表,渲染器(transitionVisual)与检查器(预设菜单)共用。
// 预设 = 具体的 (type, direction) 组合。像 keyframe 的 PRESET_IDS。
export type TransitionPreset = {
  id: string;
  type: TransitionType;
  direction?: TransitionDirection;
  label: string;
};

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

/** transition 的 (type, direction) → preset id;无匹配兜底 'fade'(用于检查器回显当前预设名) */
export const presetIdOf = (t: Pick<Transition, 'type' | 'direction'>): string =>
  TRANSITION_PRESETS.find((p) => p.type === t.type && p.direction === t.direction)?.id ?? 'fade';
