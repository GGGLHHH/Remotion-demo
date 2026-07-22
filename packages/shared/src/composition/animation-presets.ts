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
