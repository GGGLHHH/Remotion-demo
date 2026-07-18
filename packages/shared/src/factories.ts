import { DEFAULT_FPS } from './constants';
import type { SolidItem, TextItem, Track, UndoableState } from './types';

export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const baseItemDefaults = {
  rotation: 0,
  opacity: 1,
  borderRadius: 0,
  fadeInDurationInFrames: 0,
  fadeOutDurationInFrames: 0,
};

export const createTextItem = (params: {
  trackId: string;
  from: number;
  text?: string;
  left?: number;
  top?: number;
}): TextItem => ({
  ...baseItemDefaults,
  id: newId(),
  type: 'text',
  trackId: params.trackId,
  from: params.from,
  durationInFrames: DEFAULT_FPS * 3,
  text: params.text ?? '输入文本',
  left: params.left ?? 100,
  top: params.top ?? 100,
  width: 600,
  height: 120,
  fontFamily: 'Inter',
  fontWeight: '700',
  fontStyle: 'normal',
  fontSize: 80,
  color: '#ffffff',
  strokeWidth: 0,
  strokeColor: '#000000',
  lineHeight: 1.2,
  letterSpacing: 0,
  textAlign: 'center',
  direction: 'ltr',
  backgroundColor: null,
  backgroundPadding: 0,
  backgroundBorderRadius: 0,
});

export const createSolidItem = (params: {
  trackId: string;
  from: number;
  width: number;
  height: number;
}): SolidItem => ({
  ...baseItemDefaults,
  id: newId(),
  type: 'solid',
  trackId: params.trackId,
  from: params.from,
  durationInFrames: DEFAULT_FPS * 3,
  // 官方行为：新色块默认白色
  color: '#ffffff',
  left: 0,
  top: 0,
  width: params.width,
  height: params.height,
});

export const createTrack = (name: string): Track => ({
  id: newId(),
  name,
  hidden: false,
  muted: false,
});

export const createEmptyState = (params: { width: number; height: number }): UndoableState => ({
  tracks: [],
  items: {},
  assets: {},
  fps: DEFAULT_FPS,
  compositionWidth: params.width,
  compositionHeight: params.height,
  deletedAssets: [],
});
