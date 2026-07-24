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

// ---- 关键帧动画 ----
export type KeyframeEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';
/** frame 相对 item 起点(0 = item.from);同一属性数组按 frame 升序、frame 唯一 */
export type Keyframe = { frame: number; value: number; easing: KeyframeEasing };
/** v1 白名单:核心 transform(底层机制属性无关,以后可扩) */
export type AnimatableProp = 'left' | 'top' | 'width' | 'height' | 'rotation' | 'opacity';
export const ANIMATABLE_PROPS: readonly AnimatableProp[] = ['left', 'top', 'width', 'height', 'rotation', 'opacity'];

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
  /** 淡入淡出时长（帧）：视觉不透明度淡变；audio 条目同时作为音量淡变（视频音量淡变见 audioFade*） */
  fadeInDurationInFrames: number;
  fadeOutDurationInFrames: number;
  /** 稀疏:仅在打了关键帧的属性上存;非空则该属性渲染以关键帧为准、忽略静态值 */
  keyframes?: Partial<Record<AnimatableProp, Keyframe[]>>;
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
export type VideoItem = BaseItem & {
  type: 'video';
  assetId: string;
  crop: Crop | null;
  /**
   * 音频淡入/淡出（帧），与视觉淡变（基础 fade* 对）相互独立（官方行为）。
   * 缺省视为 0；旧存档（单对同时驱动画面与音量）在加载/粘贴时迁移为继承视觉淡变。
   */
  audioFadeInDurationInFrames?: number;
  audioFadeOutDurationInFrames?: number;
} & MediaTiming &
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

// 自定义素材块:库不含任何业务版式。消费端定义 kind/data 并 registerCustomItem 注册渲染器;
// 一个 custom item = 时间线上一个块,渲染器在 item 盒内自由画多元素。data 需可 JSON 序列化。
export type CustomItem = BaseItem & {
  type: 'custom';
  kind: string; // 渲染器注册 key(见 custom-items.ts)
  label: string; // 时间线块显示名
  data: Record<string, unknown>; // 渲染器自定义数据
};

export type EditorStarterItem =
  | ImageItem
  | VideoItem
  | GifItem
  | TextItem
  | SolidItem
  | AudioItem
  | CaptionsItem
  | CustomItem;

// ---- 轨道 ----

export type Track = {
  id: string;
  name: string;
  hidden: boolean;
  muted: boolean;
};

// ---- 转场 ----

export type TransitionType = 'fade' | 'slide' | 'wipe' | 'zoom';
export type TransitionDirection = 'left' | 'right' | 'up' | 'down' | 'in' | 'out'; // slide/wipe 用 4 向;zoom 用 in/out;fade 无
export type Transition = {
  id: string;
  trackId: string;
  fromItemId: string; // 出场(A)
  toItemId: string;   // 入场(B)
  type: TransitionType;
  direction?: TransitionDirection; // 加法字段;旧数据(fade)无 → 忽略,零迁移
  durationInFrames: number;
};

// ---- 分组（画布持久组：成员一起选/一起移，可拆分）----

// 轻量持久组:一个 item 至多属于一个组,成员 ≥2(降到 1 自动解散)。单一真相源——
// item 上不存 groupId,反查用 findGroupOfItem(见 groups.ts)。无嵌套、无整组缩放/旋转(v1)。
export type Group = { id: string; itemIds: string[] };

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
  transitions: Record<string, Transition>;
  /** 画布分组:groupId → 组。加法字段,旧存档缺失时回填 {}(零迁移)。 */
  groups: Record<string, Group>;
};
