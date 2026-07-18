import type { Caption } from './captions-types';

// ---- 资产（素材文件）----

export type AssetStatus = 'pending-upload' | 'in-progress' | 'uploaded' | 'error';

type BaseAsset = {
  id: string;
  /** 远端 URL（MinIO/S3）；上传完成前可能是 blob URL */
  url: string;
  filename: string;
  sizeInBytes: number;
};

export type ImageAsset = BaseAsset & { type: 'image'; width: number; height: number };
export type GifAsset = BaseAsset & {
  type: 'gif';
  width: number;
  height: number;
  durationInSeconds: number;
};
export type VideoAsset = BaseAsset & {
  type: 'video';
  width: number;
  height: number;
  durationInSeconds: number;
  hasAudio: boolean;
};
export type AudioAsset = BaseAsset & { type: 'audio'; durationInSeconds: number };
export type CaptionAsset = BaseAsset & { type: 'caption'; captions: Caption[] };

export type EditorStarterAsset = ImageAsset | VideoAsset | GifAsset | AudioAsset | CaptionAsset;

export type DeletedAsset = { assetId: string; deletedAt: number };

// ---- 条目（时间轴/画布实例）----

type BaseItem = {
  id: string;
  trackId: string;
  /** 时间轴起点（帧） */
  from: number;
  durationInFrames: number;
  /** 画布位置与尺寸（合成坐标系 px） */
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number; // 度
  opacity: number; // 0-1
  borderRadius: number;
  /** 淡入淡出时长（帧），同时作用于不透明度与音量 */
  fadeInDurationInFrames: number;
  fadeOutDurationInFrames: number;
};

export type Crop = { left: number; top: number; width: number; height: number };

type MediaTiming = {
  /** 素材内的起始偏移（帧，按素材原速计） */
  trimBefore: number;
  playbackRate: number; // 0.25 - 5
};

type AudioProps = {
  volume: number; // 0-1 线性
  muted: boolean;
};

export type ImageItem = BaseItem & { type: 'image'; assetId: string; crop: Crop | null };
export type GifItem = BaseItem & { type: 'gif'; assetId: string } & MediaTiming;
export type VideoItem = BaseItem & { type: 'video'; assetId: string; crop: Crop | null } & MediaTiming &
  AudioProps;
export type AudioItem = BaseItem & { type: 'audio'; assetId: string } & MediaTiming & AudioProps;
export type SolidItem = BaseItem & { type: 'solid'; color: string };

export type TextAlign = 'left' | 'center' | 'right';
export type TextDirection = 'ltr' | 'rtl';

export type TextStyle = {
  fontFamily: string;
  fontWeight: string; // '400' | '700' | ...
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  color: string;
  strokeWidth: number;
  strokeColor: string;
  lineHeight: number; // 0.5 - 5
  letterSpacing: number; // px, -10 - 50
  textAlign: TextAlign;
  direction: TextDirection;
  backgroundColor: string | null;
  backgroundPadding: number;
  backgroundBorderRadius: number;
};

export type TextItem = BaseItem & { type: 'text'; text: string } & TextStyle;

export type CaptionsItem = BaseItem & {
  type: 'captions';
  assetId: string; // 指向 CaptionAsset
  highlightColor: string;
  pageDurationInMs: number;
  maxLines: number;
} & Omit<TextStyle, 'backgroundColor' | 'backgroundPadding' | 'backgroundBorderRadius'>;

export type EditorStarterItem =
  | ImageItem
  | VideoItem
  | GifItem
  | TextItem
  | SolidItem
  | AudioItem
  | CaptionsItem;

// ---- 轨道 ----

export type Track = {
  id: string;
  name: string;
  hidden: boolean;
  muted: boolean;
};

// ---- 可撤销状态（唯一进撤销栈/持久化的部分）----

export type UndoableState = {
  /** 数组顺序即纵向堆叠顺序：index 0 在最上、渲染在最前 */
  tracks: Track[];
  items: Record<string, EditorStarterItem>;
  assets: Record<string, EditorStarterAsset>;
  fps: number;
  compositionWidth: number;
  compositionHeight: number;
  deletedAssets: DeletedAsset[];
};
