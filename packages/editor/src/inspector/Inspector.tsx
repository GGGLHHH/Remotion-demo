import type React from 'react';
import { useState } from 'react';
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  ArrowLeftRightIcon,
  CaptionsIcon,
  ClapperboardIcon,
  CloudUploadIcon,
  CropIcon,
  LinkIcon,
  RotateCwIcon,
  RotateCwSquareIcon,
  SquareRoundCornerIcon,
  type LucideIcon,
} from 'lucide-react';
import type {
  AnimatableProp,
  AssetStatus,
  Crop,
  EditorStarterAsset,
  EditorStarterItem,
} from '@gedatou/shared';
import { PRESET_IDS, type PresetId } from '@gedatou/shared/composition';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Spinner } from '../components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { useEditor, useEditorApi, useEditorDeps, useEditorRefs } from '../state/context';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { startRender } from '../lib/render-client';
import { generateCaptions } from '../lib/captioning';
import { useT } from '../lib/i18n';
import { NumberField } from './NumberField';
import { ColorField, FadeSliders, Row, Section, SliderField } from './fields';
import { BackgroundSection, StrokeSection, TypographySection } from './TextPanel';
import { MediaPanel } from './MediaPanel';
import { CaptionsPanel } from './CaptionsPanel';
import { KeyframeToggle } from './KeyframeToggle';
import { useItemKeyframes } from './use-item-keyframes';

export type PatchFn = (partial: Partial<EditorStarterItem>, commit?: boolean) => void;

/** 生成字幕入口：audio 或含音轨的 video（官方 Captions 区，默认折叠） */
const CaptionsSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const task = useEditor((s) => s.captioningTasks.findLast((t) => t.itemId === itemId));
  const busy = task?.status === 'extracting' || task?.status === 'transcribing';
  return (
    <Section title={t('inspector.captions')} collapsible defaultOpen={false}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void generateCaptions(editorApi, deps, itemId)}
      >
        {busy ? <Spinner /> : <CaptionsIcon />}
        {busy
          ? task.status === 'extracting'
            ? t('inspector.extractingAudio')
            : t('inspector.transcribing')
          : t('inspector.generateCaptions')}
      </Button>
      {task?.status === 'error' ? (
        <div className="break-all text-xs text-destructive">{task.error?.slice(0, 200)}</div>
      ) : null}
    </Section>
  );
};

// ---- 空状态面板：画布 / 时长 / 导出 ----

const CODEC_LABELS: Record<'mp4' | 'webm', string> = {
  mp4: 'MP4 (H.264)',
  webm: 'WebM (VP8)',
};

const ExportSection: React.FC<{ exportExtra?: React.ReactNode }> = ({ exportExtra }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const renderingTasks = useEditor((s) => s.renderingTasks);
  const hasItems = useEditor((s) => Object.keys(s.undoable.items).length > 0);
  const [codec, setCodec] = useState<'mp4' | 'webm'>('mp4');

  return (
    <Section title={t('inspector.export')}>
      <Select items={CODEC_LABELS} value={codec} onValueChange={(v) => setCodec(v as 'mp4' | 'webm')}>
        <SelectTrigger size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mp4">{CODEC_LABELS.mp4}</SelectItem>
          <SelectItem value="webm">{CODEC_LABELS.webm}</SelectItem>
        </SelectContent>
      </Select>
      {/* 官方行为：时间线为空时禁用渲染按钮 */}
      <Button size="sm" variant="secondary" disabled={!hasItems} onClick={() => void startRender(editorApi, deps, codec)}>
        <ClapperboardIcon />
        {t('inspector.render')}
      </Button>
      {renderingTasks.map((task) => (
        <div key={task.id} className="rounded-lg border border-border p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            {/* 文件名由前端在发起渲染时就组装好（见 lib/render-client），故全程可显示，
                且就是实际下载到的名字。codec 已体现在扩展名里，不再另挂徽章。 */}
            <span className="min-w-0 flex-1 truncate font-medium" title={task.fileName ?? task.codec}>
              {task.fileName ?? task.codec}
            </span>
            {task.status === 'done' && task.url ? (
              /* 产物带 Content-Disposition: attachment（文件名由服务端定；跨源 URL 下
                 a[download] 的文件名会被浏览器忽略），故不加 target=_blank 免闪空白页 */
              <a
                href={task.url}
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t('inspector.download')}
              </a>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {task.status === 'error' ? t('inspector.failed') : `${Math.round(task.progress * 100)}%`}
              </span>
            )}
          </div>
          {task.status === 'error' ? (
            <div className="mt-1 break-all text-destructive">{task.error?.slice(0, 200)}</div>
          ) : (
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round(task.progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}
      {/* 宿主注入槽：渲染产物的持久历史（renderingTasks 是内存态、刷新即失，持久列表由宿主提供） */}
      {exportExtra}
    </Section>
  );
};

/** 合成总时长 mm:ss.cc（官方 Duration 区的只读读数） */
const formatTimecode = (frames: number, fps: number): string => {
  const totalCs = Math.round((frames / fps) * 100);
  const mm = String(Math.floor(totalCs / 6000)).padStart(2, '0');
  const ss = String(Math.floor((totalCs % 6000) / 100)).padStart(2, '0');
  const cs = String(totalCs % 100).padStart(2, '0');
  return `${mm}:${ss}.${cs}`;
};

const CompositionPanel: React.FC<{ canvasExtra?: React.ReactNode; exportExtra?: React.ReactNode }> = ({
  canvasExtra,
  exportExtra,
}) => {
  const t = useT();
  const width = useEditor((s) => s.undoable.compositionWidth);
  const height = useEditor((s) => s.undoable.compositionHeight);
  const fps = useEditor((s) => s.undoable.fps);
  const totalFrames = useEditor((s) =>
    Object.values(s.undoable.items).reduce((m, i) => Math.max(m, i.from + i.durationInFrames), 0),
  );
  const updateUndoable = useEditor((s) => s.updateUndoable);

  return (
    <>
      <Section title={t('inspector.canvas')}>
        <div className="flex items-center gap-2">
          <NumberField
            inline
            label="W"
            className="flex-1"
            value={width}
            min={2}
            onChange={(v, c) =>
              updateUndoable((s) => ({ ...s, compositionWidth: Math.round(v / 2) * 2 }), { commit: c })
            }
          />
          <NumberField
            inline
            label="H"
            className="flex-1"
            value={height}
            min={2}
            onChange={(v, c) =>
              updateUndoable((s) => ({ ...s, compositionHeight: Math.round(v / 2) * 2 }), { commit: c })
            }
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('inspector.swapDimensions')}
                  onClick={() =>
                    updateUndoable((s) => ({
                      ...s,
                      compositionWidth: s.compositionHeight,
                      compositionHeight: s.compositionWidth,
                    }))
                  }
                >
                  <ArrowLeftRightIcon />
                </Button>
              }
            />
            <TooltipContent>{t('inspector.swapDimensions')}</TooltipContent>
          </Tooltip>
        </div>
        {canvasExtra}
      </Section>
      <Section title={t('inspector.duration')}>
        <div className="text-xs tabular-nums text-muted-foreground">
          {formatTimecode(totalFrames, fps)}
        </div>
      </Section>
      <ExportSection exportExtra={exportExtra} />
    </>
  );
};

// ---- 源信息（官方 Source 区：文件名 / 时长 / 大小 + 云图标） ----

/** 字节数转人类可读 */
const formatBytes = (n: number): string => {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatSeconds = (s: number): string => {
  const t = Math.round(s);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

const UPLOAD_STATUS_KEY: Record<AssetStatus, string> = {
  'pending-upload': 'inspector.statusPendingUpload',
  'in-progress': 'inspector.statusInProgress',
  uploaded: 'inspector.statusUploaded',
  error: 'inspector.statusError',
};

const SourceSection: React.FC<{ asset: EditorStarterAsset }> = ({ asset }) => {
  const t = useT();
  const status = useEditor((s) => s.assetStatus[asset.id]);
  const progress = useEditor((s) => s.uploadProgress[asset.id]);
  const duration =
    asset.type === 'video' || asset.type === 'audio' || asset.type === 'gif'
      ? asset.durationInSeconds
      : null;
  return (
    <Section title={t('inspector.source')} collapsible defaultOpen>
      <div className="break-all text-xs">{asset.filename}</div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {duration !== null ? <span className="tabular-nums">{formatSeconds(duration)}</span> : null}
        <span className="flex items-center gap-1">
          <CloudUploadIcon className="size-3.5" />
          {formatBytes(asset.sizeInBytes)}
        </span>
        {/* 上传未完成/失败才显示状态（官方无此行，仅作瞬时提示） */}
        {status && status !== 'uploaded' ? (
          <Badge variant={status === 'error' ? 'destructive' : 'secondary'}>
            {status === 'in-progress' && progress !== undefined
              ? t('inspector.uploading', { progress })
              : t(UPLOAD_STATUS_KEY[status])}
          </Badge>
        ) : null}
      </div>
    </Section>
  );
};

// ---- 布局（官方 Layout 区：对齐 / 位置 / 尺寸 / 旋转） ----

const ALIGNS: {
  key: string;
  label: string;
  icon: LucideIcon;
  apply: (compW: number, compH: number, it: EditorStarterItem) => Partial<EditorStarterItem>;
}[] = [
  { key: 'l', label: 'inspector.alignLeft', icon: AlignStartVerticalIcon, apply: () => ({ left: 0 }) },
  { key: 'ch', label: 'inspector.alignCenterH', icon: AlignCenterVerticalIcon, apply: (w, _h, it) => ({ left: Math.round((w - it.width) / 2) }) },
  { key: 'r', label: 'inspector.alignRight', icon: AlignEndVerticalIcon, apply: (w, _h, it) => ({ left: w - it.width }) },
  { key: 't', label: 'inspector.alignTop', icon: AlignStartHorizontalIcon, apply: () => ({ top: 0 }) },
  { key: 'cv', label: 'inspector.alignCenterV', icon: AlignCenterHorizontalIcon, apply: (_w, h, it) => ({ top: Math.round((h - it.height) / 2) }) },
  { key: 'b', label: 'inspector.alignBottom', icon: AlignEndHorizontalIcon, apply: (_w, h, it) => ({ top: h - it.height }) },
];

/** 拼接式按钮组（官方 joined segmented group） */
const groupCls = (i: number, len: number) =>
  `flex-1 rounded-none ${i === 0 ? 'rounded-l-lg' : '-ml-px'} ${i === len - 1 ? 'rounded-r-lg' : ''}`;

const LayoutSection: React.FC<{
  item: EditorStarterItem;
  patch: PatchFn;
  showLock: boolean;
  lockDefault: boolean;
}> = ({ item, patch, showLock, lockDefault }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const kf = useItemKeyframes(item.id);
  const refs = useEditorRefs();
  // ItemPanel 以 item.id 为 key 重挂，锁比例默认值随类型生效（图片/视频默认开）
  const [locked, setLocked] = useState(lockDefault);
  /** 有关键帧的属性写关键帧（在播放头处 upsert），否则走原静态 patch —— 无关键帧条目行为不变。
   *  播放头帧号在提交时刻读取（imperative），不订阅，播放中不拖累整个面板重渲。 */
  const animPatch = (prop: AnimatableProp, v: number, commit?: boolean) => {
    if (kf.has(prop)) {
      const f = Math.max(0, Math.min(item.durationInFrames, refs.getPlayerFrame() - item.from));
      kf.setValue(prop, f, v, commit);
    } else {
      patch({ [prop]: v } as Partial<EditorStarterItem>, commit);
    }
  };

  const alignGroup = (defs: typeof ALIGNS) => (
    <div className="flex flex-1">
      {defs.map((a, i) => (
        <Tooltip key={a.key}>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                className={groupCls(i, defs.length)}
                onClick={() => {
                  const s = editorApi.getState().undoable;
                  const cur = s.items[item.id];
                  if (!cur) return;
                  const [key, value] = Object.entries(
                    a.apply(s.compositionWidth, s.compositionHeight, cur),
                  )[0] as [AnimatableProp, number];
                  animPatch(key, value, true);
                }}
              >
                <a.icon />
              </Button>
            }
          />
          <TooltipContent>{t(a.label)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );

  // ponytail: 锁比例按当前宽高比逐帧换算，长距离拖拽有轻微取整漂移；需要精确时在 scrub 起点缓存比例
  // 无关键帧时两维一次 patch 合并提交（单条撤销，行为与改造前完全一致）；
  // 但凡 width/height 任一打了关键帧，两维分开走 animPatch（关键帧按属性各自存列表，没有合并写入口）。
  const setLinkedDim = (prop: 'width' | 'height', v: number, c: boolean) => {
    const other = prop === 'width' ? 'height' : 'width';
    const linked = locked ? Math.max(1, Math.round((v * item[other]) / item[prop])) : null;
    if (!kf.has(prop) && (linked === null || !kf.has(other))) {
      patch((linked === null ? { [prop]: v } : { [prop]: v, [other]: linked }) as Partial<EditorStarterItem>, c);
      return;
    }
    animPatch(prop, v, c);
    if (linked !== null) animPatch(other, linked, c);
  };
  const setW = (v: number, c: boolean) => setLinkedDim('width', v, c);
  const setH = (v: number, c: boolean) => setLinkedDim('height', v, c);

  return (
    <Section title={t('inspector.layout')} collapsible defaultOpen>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.align')}</span>
        <div className="flex gap-2">
          {alignGroup(ALIGNS.slice(0, 3))}
          {alignGroup(ALIGNS.slice(3))}
        </div>
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.position')}</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1">
            <NumberField inline label="X" className="flex-1" value={item.left} onChange={(v, c) => animPatch('left', v, c)} />
            <KeyframeToggle item={item} prop="left" kf={kf} />
          </div>
          <div className="flex items-center gap-1">
            <NumberField inline label="Y" className="flex-1" value={item.top} onChange={(v, c) => animPatch('top', v, c)} />
            <KeyframeToggle item={item} prop="top" kf={kf} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('inspector.size')}</span>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1">
            <NumberField inline label="W" className="flex-1" value={item.width} min={1} onChange={setW} />
            <KeyframeToggle item={item} prop="width" kf={kf} />
          </div>
          <div className="flex flex-1 items-center gap-1">
            <NumberField inline label="H" className="flex-1" value={item.height} min={1} onChange={setH} />
            <KeyframeToggle item={item} prop="height" kf={kf} />
          </div>
          {showLock ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-pressed={locked}
                    className={locked ? 'border-primary text-primary' : ''}
                    onClick={() => setLocked((l) => !l)}
                  >
                    <LinkIcon />
                  </Button>
                }
              />
              <TooltipContent>{t('inspector.lockAspect')}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-1 items-end gap-1">
          <NumberField
            label={t('inspector.rotation')}
            icon={RotateCwIcon}
            className="flex-1"
            value={item.rotation}
            onChange={(v, c) => animPatch('rotation', v, c)}
          />
          <KeyframeToggle item={item} prop="rotation" kf={kf} />
        </div>
        <div className="flex flex-col">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => animPatch('rotation', (item.rotation + 90) % 360, true)}
                >
                  <RotateCwSquareIcon />
                </Button>
              }
            />
            <TooltipContent>{t('inspector.rotate90')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Section>
  );
};


// ---- 动画预设（一键套用：写入多属性关键帧，见 lib/keyframe-ops#applyAnimationPreset） ----

const AnimationSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const t = useT();
  const kf = useItemKeyframes(itemId);
  return (
    <Section title={t('inspector.animation')} collapsible defaultOpen={false}>
      <Row label={t('inspector.preset')}>
        <select
          className="h-7 rounded border bg-transparent px-1 text-xs"
          value=""
          onChange={(e) => {
            const v = e.target.value as PresetId;
            if (v) kf.applyPreset(v);
            e.currentTarget.value = '';
          }}
        >
          <option value="">…</option>
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
};

// ---- 填充（官方 Fill 区：透明度滑杆 + 颜色 + 圆角） ----

const FillSection: React.FC<{
  item: EditorStarterItem;
  patch: PatchFn;
  color?: string;
  onColor?: (v: string) => void;
  showRadius?: boolean;
}> = ({ item, patch, color, onColor, showRadius }) => {
  const t = useT();
  const kf = useItemKeyframes(item.id);
  const refs = useEditorRefs();
  const pct = Math.round(item.opacity * 100);
  const animPatch = (prop: AnimatableProp, v: number, commit?: boolean) => {
    if (kf.has(prop)) {
      const f = Math.max(0, Math.min(item.durationInFrames, refs.getPlayerFrame() - item.from));
      kf.setValue(prop, f, v, commit);
    } else {
      patch({ [prop]: v } as Partial<EditorStarterItem>, commit);
    }
  };
  return (
    <Section title={t('inspector.fill')} collapsible defaultOpen>
      <div className="flex items-end gap-1">
        <div className="min-w-0 flex-1">
          <SliderField
            label={t('inspector.opacity')}
            value={pct}
            min={0}
            max={100}
            step={1}
            display={`${pct}%`}
            onChange={(v) => animPatch('opacity', v / 100, false)}
          />
        </div>
        <KeyframeToggle item={item} prop="opacity" kf={kf} />
      </div>
      {color !== undefined && onColor ? (
        <ColorField label={t('inspector.color')} value={color} onChange={onColor} />
      ) : null}
      {showRadius ? (
        <NumberField
          label={t('inspector.borderRadius')}
          icon={SquareRoundCornerIcon}
          value={item.borderRadius}
          min={0}
          onChange={(v, c) => patch({ borderRadius: v }, c)}
        />
      ) : null}
    </Section>
  );
};

// ---- 裁剪（官方 Crop 区：左/上/右/下四条边距滑杆，0-100%、px 读数，实时生效） ----

const CropSection: React.FC<{
  item: EditorStarterItem & { crop: Crop | null };
  mediaW: number;
  mediaH: number;
  patch: PatchFn;
}> = ({ item, mediaW, mediaH, patch }) => {
  const t = useT();
  const setItemSelectedForCrop = useEditor((s) => s.setItemSelectedForCrop);
  /** 播放头不在此元素时间范围内时画布上看不到它，裁剪按钮禁用（官方行为）。
      派生订阅：仅布尔值翻转时重渲（播放中不再每帧重渲整个分区） */
  const visibleAtPlayhead = usePlayerFrameDerived(
    (f) => f >= item.from && f < item.from + item.durationInFrames,
  );

  const cur = item.crop ?? { left: 0, top: 0, width: mediaW, height: mediaH };
  const edges = {
    left: cur.left,
    top: cur.top,
    right: mediaW - cur.left - cur.width,
    bottom: mediaH - cur.top - cur.height,
  };

  /**
   * 联动更新（官方语义，与画布裁剪模式一致）：crop 窗口变化时同步收缩/平移元素框，
   * 剩余内容在画布上保持原位原尺度——只改 crop 会表现为"移动/缩放画面"而非裁剪。
   */
  const applyCrop = (next: Crop | null, commit: boolean) => {
    const target = next ?? { left: 0, top: 0, width: mediaW, height: mediaH };
    const sx = item.width / cur.width;
    const sy = item.height / cur.height;
    const r = (n: number) => Math.round(n * 100) / 100;
    patch(
      {
        crop: next,
        left: r(item.left + (target.left - cur.left) * sx),
        top: r(item.top + (target.top - cur.top) * sy),
        width: r(target.width * sx),
        height: r(target.height * sy),
      } as Partial<EditorStarterItem>,
      commit,
    );
  };

  /** 边距滑杆（百分比域）→ 源素材像素 crop；保证至少 1px 宽高 */
  const setEdge = (edge: keyof typeof edges, pctV: number) => {
    const total = edge === 'left' || edge === 'right' ? mediaW : mediaH;
    const e = { ...edges, [edge]: Math.round((pctV / 100) * total) };
    if (edge === 'left') e.left = Math.min(e.left, mediaW - e.right - 1);
    if (edge === 'right') e.right = Math.min(e.right, mediaW - e.left - 1);
    if (edge === 'top') e.top = Math.min(e.top, mediaH - e.bottom - 1);
    if (edge === 'bottom') e.bottom = Math.min(e.bottom, mediaH - e.top - 1);
    applyCrop(
      {
        left: e.left,
        top: e.top,
        width: mediaW - e.left - e.right,
        height: mediaH - e.top - e.bottom,
      },
      false,
    );
  };

  /** 数字裁剪：源素材像素坐标，夹紧到素材边界 */
  const setPart = (partial: Partial<Crop>, commit: boolean) => {
    const c = { ...cur, ...partial };
    const left = Math.min(Math.max(0, c.left), mediaW - 1);
    const top = Math.min(Math.max(0, c.top), mediaH - 1);
    applyCrop(
      {
        left,
        top,
        width: Math.min(Math.max(1, c.width), mediaW - left),
        height: Math.min(Math.max(1, c.height), mediaH - top),
      },
      commit,
    );
  };

  const edgeSlider = (label: string, edge: keyof typeof edges) => {
    const total = edge === 'left' || edge === 'right' ? mediaW : mediaH;
    return (
      <SliderField
        label={label}
        value={Math.round((edges[edge] / total) * 100)}
        min={0}
        max={100}
        step={1}
        display={`${Math.round(edges[edge])}px`}
        onChange={(v) => setEdge(edge, v)}
      />
    );
  };

  return (
    <Section title={t('inspector.crop')} collapsible defaultOpen={false}>
      {edgeSlider(t('inspector.cropLeft'), 'left')}
      {edgeSlider(t('inspector.cropTop'), 'top')}
      {edgeSlider(t('inspector.cropRight'), 'right')}
      {edgeSlider(t('inspector.cropBottom'), 'bottom')}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label={t('inspector.cropX')} value={Math.round(cur.left)} min={0} max={mediaW - 1} onChange={(v, c) => setPart({ left: v }, c)} />
        <NumberField label={t('inspector.cropY')} value={Math.round(cur.top)} min={0} max={mediaH - 1} onChange={(v, c) => setPart({ top: v }, c)} />
        <NumberField label={t('inspector.cropW')} value={Math.round(cur.width)} min={1} max={mediaW} onChange={(v, c) => setPart({ width: v }, c)} />
        <NumberField label={t('inspector.cropH')} value={Math.round(cur.height)} min={1} max={mediaH} onChange={(v, c) => setPart({ height: v }, c)} />
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={!visibleAtPlayhead}
          title={visibleAtPlayhead ? undefined : t('inspector.cropOutOfRange')}
          onClick={() => setItemSelectedForCrop(item.id)}
        >
          <CropIcon />
          {t('inspector.enterCrop')}
        </Button>
        {item.crop ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => applyCrop(null, true)}
          >
            {t('inspector.reset')}
          </Button>
        ) : null}
      </div>
    </Section>
  );
};

// ---- 单选条目面板：按官方顺序拼装分区 ----

const FadeSection: React.FC<{ item: EditorStarterItem; patch: PatchFn; defaultOpen?: boolean }> = ({
  item,
  patch,
  defaultOpen = false,
}) => {
  const t = useT();
  const fps = useEditor((s) => s.undoable.fps);
  return (
    <Section title={t('inspector.fade')} collapsible defaultOpen={defaultOpen}>
      <FadeSliders
        fadeInFrames={item.fadeInDurationInFrames}
        fadeOutFrames={item.fadeOutDurationInFrames}
        durationInFrames={item.durationInFrames}
        fps={fps}
        onPatch={(p) => patch(p, false)}
      />
    </Section>
  );
};

/** 条目补丁函数(ItemPanel 同款,亦供宿主拼装 InspectorSections 用):
 *  partial 合入 item 顶层字段;commit=false 走高频路径,松手用 store.commitPending 提交。 */
export const useItemPatch = (itemId: string): PatchFn => {
  const updateUndoable = useEditor((s) => s.updateUndoable);
  return (partial, commit = true) => {
    updateUndoable(
      (s) => {
        const cur = s.items[itemId];
        if (!cur) return s;
        return { ...s, items: { ...s.items, [itemId]: { ...cur, ...partial } as EditorStarterItem } };
      },
      { commit },
    );
  };
};

const ItemPanel: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  const deps = useEditorDeps();
  const asset = useEditor((s) =>
    'assetId' in item ? s.undoable.assets[item.assetId] : undefined,
  );
  const patch = useItemPatch(item.id);

  // custom item 的领域面板:宿主经 deps.customItemPanels 按 kind 提供,渲染在通用分区之前
  const CustomPanel = item.type === 'custom' ? deps.customItemPanels?.[item.kind] : undefined;

  const isVisual = item.type !== 'audio';
  const isMedia = item.type === 'image' || item.type === 'video' || item.type === 'gif';
  const croppable =
    (item.type === 'video' || item.type === 'image') &&
    asset &&
    (asset.type === 'video' || asset.type === 'image');

  return (
    <>
      {CustomPanel && item.type === 'custom' ? <CustomPanel item={item} /> : null}
      {asset && asset.type !== 'caption' ? <SourceSection asset={asset} /> : null}
      {isVisual ? (
        <LayoutSection
          item={item}
          patch={patch}
          // 官方：图片/视频默认锁定宽高比（高亮），纯色可用但默认关，文本/字幕无此按钮
          showLock={item.type === 'solid' || isMedia}
          lockDefault={isMedia}
        />
      ) : null}
      {isVisual ? <AnimationSection itemId={item.id} /> : null}
      {item.type === 'text' ? <TypographySection item={item} /> : null}
      {item.type === 'solid' ? (
        <FillSection item={item} patch={patch} color={item.color} onColor={(v) => patch({ color: v })} showRadius />
      ) : null}
      {item.type === 'text' ? (
        <>
          <FillSection item={item} patch={patch} color={item.color} onColor={(v) => patch({ color: v })} />
          <StrokeSection item={item} />
          <BackgroundSection item={item} />
        </>
      ) : null}
      {isMedia ? <FillSection item={item} patch={patch} showRadius /> : null}
      {item.type === 'captions' ? <FillSection item={item} patch={patch} /> : null}
      {croppable && 'crop' in item ? (
        <CropSection item={item} mediaW={asset.width} mediaH={asset.height} patch={patch} />
      ) : null}
      {item.type === 'captions' ? <CaptionsPanel item={item} /> : null}
      {/* 视频/音频/GIF 的淡入淡出收在「视频/音频」区内（官方结构），其余类型独立 Fade 区 */}
      {item.type === 'video' || item.type === 'audio' || item.type === 'gif' ? (
        <MediaPanel item={item} />
      ) : (
        // 纯色默认展开：verify-m4 直接填写淡入s（官方默认折叠）
        <FadeSection item={item} patch={patch} defaultOpen={item.type === 'solid'} />
      )}
      {item.type === 'audio' || (item.type === 'video' && asset?.type === 'video' && asset.hasAudio) ? (
        <CaptionsSection itemId={item.id} />
      ) : null}
    </>
  );
};

/** 注入槽(宿主放自定义控件,库自身不放内容 —— 不传时 DOM 与官方一致):
 *  - canvasExtra:检查器「画布」区末尾(如尺寸预设)
 *  - exportExtra:「导出」区末尾、渲染任务列表之后(如渲染产物的持久历史) */
export const Inspector: React.FC<{
  className?: string;
  canvasExtra?: React.ReactNode;
  exportExtra?: React.ReactNode;
}> = ({ className, canvasExtra, exportExtra }) => {
  const selectedItemIds = useEditor((s) => s.selectedItemIds);
  const items = useEditor((s) => s.undoable.items);

  const selected = selectedItemIds.map((id) => items[id]).filter(Boolean);

  const content =
    selected.length === 0 ? (
      <CompositionPanel canvasExtra={canvasExtra} exportExtra={exportExtra} />
    ) : selected.length > 1 ? (
      // 官方行为：多选时面板完全留空
      null
    ) : (
      // key=item.id：切换选中时重挂，重置锁比例/折叠等本地状态
      <ItemPanel key={selected[0].id} item={selected[0]} />
    );

  // 无 className（EditorRoot preset 用外层 aside 控宽）→ 直接返回内容，DOM 不变；
  // 传 className（自拼布局的宿主）→ 包一层带样式的容器，空/多选时也保持列宽。
  return className ? <div className={className}>{content}</div> : content;
};

/** 检查器 section 积木:宿主可绕开成品 Inspector,自行拼装面板(配合 useItemPatch)。
 *  成品 Inspector = 官方默认拼法,这些导出不改变其行为。 */
export const InspectorSections = {
  Composition: CompositionPanel,
  Item: ItemPanel,
  Source: SourceSection,
  Layout: LayoutSection,
  Fill: FillSection,
  Crop: CropSection,
  Fade: FadeSection,
  Captions: CaptionsSection,
  Export: ExportSection,
} as const;
