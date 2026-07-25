import { DEFAULT_FPS } from './constants';
import type { Caption } from './captions-types';
import type { CaptionAsset, CaptionsItem, CustomItem, SolidItem, TextItem, Track, UndoableState } from './types';

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

/** 字幕数据是内联的（不走对象存储），所以 url 空、sizeInBytes 0 —— 一条 CaptionAsset 只是一个 Caption[] 的壳 */
export const createCaptionAsset = (params: { captions: Caption[]; filename?: string }): CaptionAsset => ({
  id: newId(),
  type: 'caption',
  url: '',
  filename: params.filename ?? 'captions.json',
  sizeInBytes: 0,
  captions: params.captions,
});

/** 字幕块。位置按合成尺寸算：宽 80% 居中、底部上方 320px —— 两条创建路径（whisper 生成 / 手动新建）共用同一套默认值 */
export const createCaptionsItem = (params: {
  trackId: string;
  from: number;
  assetId: string;
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames?: number;
  sourceItemId?: string;
}): CaptionsItem => {
  const width = Math.round(params.compositionWidth * 0.8);
  return {
    ...baseItemDefaults,
    id: newId(),
    type: 'captions',
    trackId: params.trackId,
    assetId: params.assetId,
    ...(params.sourceItemId ? { sourceItemId: params.sourceItemId } : {}),
    from: params.from,
    durationInFrames: params.durationInFrames ?? DEFAULT_FPS * 3,
    left: Math.round((params.compositionWidth - width) / 2),
    top: params.compositionHeight - 320,
    width,
    height: 200,
    highlightColor: '#facc15',
    pageDurationInMs: 1200,
    maxLines: 2,
    fontFamily: 'Inter',
    fontWeight: '700',
    fontStyle: 'normal',
    fontSize: 64,
    color: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: 'center',
    direction: 'ltr',
  };
};

// 自定义素材块:kind/data 由消费端定义,渲染器经 registerCustomItem 注册(见 custom-items.ts)
export const createCustomItem = (params: {
  trackId: string;
  from: number;
  width: number;
  height: number;
  kind: string;
  label?: string;
  data?: Record<string, unknown>;
}): CustomItem => ({
  ...baseItemDefaults,
  id: newId(),
  type: 'custom',
  trackId: params.trackId,
  from: params.from,
  durationInFrames: DEFAULT_FPS * 3,
  left: 0,
  top: 0,
  width: params.width,
  height: params.height,
  kind: params.kind,
  label: params.label ?? params.kind,
  data: params.data ?? {},
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
  transitions: {},
  groups: {},
});
