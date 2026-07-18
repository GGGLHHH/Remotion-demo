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
  CropIcon,
  RotateCwIcon,
  type LucideIcon,
} from 'lucide-react';
import type { AssetStatus, Crop, EditorStarterAsset, EditorStarterItem } from '@editor/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditorStore } from '../state/store';
import { startRender } from '../lib/render-client';
import { generateCaptions } from '../lib/captioning';
import { NumberField } from './NumberField';
import { ColorField, Row, Section } from './fields';
import { TextPanel } from './TextPanel';
import { MediaPanel } from './MediaPanel';
import { CaptionsPanel } from './CaptionsPanel';

/** 生成字幕入口：audio 或含音轨的 video */
const CaptionsSection: React.FC<{ itemId: string }> = ({ itemId }) => {
  const task = useEditorStore((s) => s.captioningTasks.findLast((t) => t.itemId === itemId));
  const busy = task?.status === 'extracting' || task?.status === 'transcribing';
  return (
    <Section title="字幕">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void generateCaptions(itemId)}
      >
        {busy ? <Spinner /> : <CaptionsIcon />}
        {busy ? (task.status === 'extracting' ? '抽取音频中…' : '转录中…') : '生成字幕'}
      </Button>
      {task?.status === 'error' ? (
        <div className="break-all text-xs text-destructive">{task.error?.slice(0, 200)}</div>
      ) : null}
    </Section>
  );
};

const CODEC_LABELS: Record<'mp4' | 'webm', string> = {
  mp4: 'MP4 (H.264)',
  webm: 'WebM (VP8)',
};

const RenderSection: React.FC = () => {
  const renderingTasks = useEditorStore((s) => s.renderingTasks);
  const [codec, setCodec] = useState<'mp4' | 'webm'>('mp4');

  return (
    <Section title="渲染">
      <Row label="格式">
        <Select items={CODEC_LABELS} value={codec} onValueChange={(v) => setCodec(v as 'mp4' | 'webm')}>
          <SelectTrigger size="sm" className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mp4">{CODEC_LABELS.mp4}</SelectItem>
            <SelectItem value="webm">{CODEC_LABELS.webm}</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      <Button size="sm" onClick={() => void startRender(codec)}>
        <ClapperboardIcon />
        渲染
      </Button>
      {renderingTasks.map((t) => (
        <div key={t.id} className="rounded-lg border border-border p-2 text-xs">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="uppercase">
              {t.codec}
            </Badge>
            {t.status === 'done' && t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                下载
              </a>
            ) : (
              <span className="tabular-nums text-muted-foreground">
                {t.status === 'error' ? '失败' : `${Math.round(t.progress * 100)}%`}
              </span>
            )}
          </div>
          {t.status === 'error' ? (
            <div className="mt-1 break-all text-destructive">{t.error?.slice(0, 200)}</div>
          ) : (
            <div className="mt-2 h-1 rounded-full bg-muted">
              <div
                className="h-1 rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.round(t.progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </Section>
  );
};

const CompositionPanel: React.FC = () => {
  const width = useEditorStore((s) => s.undoable.compositionWidth);
  const height = useEditorStore((s) => s.undoable.compositionHeight);
  const updateUndoable = useEditorStore((s) => s.updateUndoable);

  return (
    <>
      <Section title="合成设置">
        <NumberField
          label="宽度"
          value={width}
          min={2}
          onCommit={(v) => updateUndoable((s) => ({ ...s, compositionWidth: Math.round(v / 2) * 2 }))}
        />
        <NumberField
          label="高度"
          value={height}
          min={2}
          onCommit={(v) => updateUndoable((s) => ({ ...s, compositionHeight: Math.round(v / 2) * 2 }))}
        />
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            updateUndoable((s) => ({
              ...s,
              compositionWidth: s.compositionHeight,
              compositionHeight: s.compositionWidth,
            }))
          }
        >
          <ArrowLeftRightIcon />
          交换尺寸
        </Button>
      </Section>
      <RenderSection />
    </>
  );
};

/** 字节数转人类可读 */
const formatBytes = (n: number): string => {
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(n) / 10));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

/** 按扩展名猜 mime（asset 未存 contentType） */
const guessMime = (filename: string): string | null => {
  const map: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  };
  return map[filename.split('.').pop()?.toLowerCase() ?? ''] ?? null;
};

const UPLOAD_STATUS_LABEL: Record<AssetStatus, string> = {
  'pending-upload': '等待上传',
  'in-progress': '上传中…',
  uploaded: '已上传',
  error: '上传失败',
};

/** 源信息：选中项底层素材的元数据与上传状态（官方 Source info） */
const SourceInfoSection: React.FC<{ asset: EditorStarterAsset }> = ({ asset }) => {
  const status = useEditorStore((s) => s.assetStatus[asset.id]);
  const mime = guessMime(asset.filename);
  const rows: [string, string][] = [
    ['文件名', asset.filename],
    ['大小', formatBytes(asset.sizeInBytes)],
  ];
  if (mime) rows.push(['类型', mime]);
  if (asset.type === 'video' || asset.type === 'image' || asset.type === 'gif') {
    rows.push(['原始尺寸', `${asset.width}×${asset.height}`]);
  }
  if (asset.type === 'video' || asset.type === 'audio' || asset.type === 'gif') {
    rows.push(['时长', `${asset.durationInSeconds.toFixed(2)}s`]);
  }
  return (
    <Section title="源信息">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-2 text-xs">
          <span className="w-14 shrink-0 text-muted-foreground">{k}</span>
          <span className="min-w-0 break-all text-right text-foreground/80">{v}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="w-14 shrink-0 text-muted-foreground">上传状态</span>
        <Badge variant={status === 'error' ? 'destructive' : 'secondary'}>
          {status ? UPLOAD_STATUS_LABEL[status] : '仅本地'}
        </Badge>
      </div>
    </Section>
  );
};

/** 数字裁剪：源素材像素坐标，夹紧到素材边界（官方 Numeric cropping controls） */
const CropFields: React.FC<{
  crop: Crop | null;
  mediaW: number;
  mediaH: number;
  onChange: (crop: Crop) => void;
}> = ({ crop, mediaW, mediaH, onChange }) => {
  // 未裁剪时按整幅显示，编辑任一字段即建立裁剪
  const cur = crop ?? { left: 0, top: 0, width: mediaW, height: mediaH };
  const setPart = (partial: Partial<Crop>) => {
    const c = { ...cur, ...partial };
    const left = Math.min(Math.max(0, c.left), mediaW - 1);
    const top = Math.min(Math.max(0, c.top), mediaH - 1);
    onChange({
      left,
      top,
      width: Math.min(Math.max(1, c.width), mediaW - left),
      height: Math.min(Math.max(1, c.height), mediaH - top),
    });
  };
  return (
    <>
      <NumberField label="裁剪X" value={Math.round(cur.left)} min={0} max={mediaW - 1} onCommit={(v) => setPart({ left: v })} />
      <NumberField label="裁剪Y" value={Math.round(cur.top)} min={0} max={mediaH - 1} onCommit={(v) => setPart({ top: v })} />
      <NumberField label="裁剪宽" value={Math.round(cur.width)} min={1} max={mediaW} onCommit={(v) => setPart({ width: v })} />
      <NumberField label="裁剪高" value={Math.round(cur.height)} min={1} max={mediaH} onCommit={(v) => setPart({ height: v })} />
    </>
  );
};

const ALIGNS: { key: string; label: string; icon: LucideIcon; apply: (compW: number, compH: number, it: EditorStarterItem) => Partial<EditorStarterItem> }[] = [
  { key: 'l', label: '左对齐', icon: AlignStartVerticalIcon, apply: () => ({ left: 0 }) },
  { key: 'ch', label: '水平居中', icon: AlignCenterVerticalIcon, apply: (w, _h, it) => ({ left: Math.round((w - it.width) / 2) }) },
  { key: 'r', label: '右对齐', icon: AlignEndVerticalIcon, apply: (w, _h, it) => ({ left: w - it.width }) },
  { key: 't', label: '顶对齐', icon: AlignStartHorizontalIcon, apply: () => ({ top: 0 }) },
  { key: 'cv', label: '垂直居中', icon: AlignCenterHorizontalIcon, apply: (_w, h, it) => ({ top: Math.round((h - it.height) / 2) }) },
  { key: 'b', label: '底对齐', icon: AlignEndHorizontalIcon, apply: (_w, h, it) => ({ top: h - it.height }) },
];

const ItemPanel: React.FC<{ item: EditorStarterItem }> = ({ item }) => {
  const updateUndoable = useEditorStore((s) => s.updateUndoable);
  const setItemSelectedForCrop = useEditorStore((s) => s.setItemSelectedForCrop);
  const fps = useEditorStore((s) => s.undoable.fps);
  const asset = useEditorStore((s) =>
    'assetId' in item ? s.undoable.assets[item.assetId] : undefined,
  );
  const [aspectLocked, setAspectLocked] = useState(false);

  const patch = (partial: Partial<EditorStarterItem>) => {
    updateUndoable((s) => {
      const cur = s.items[item.id];
      if (!cur) return s;
      return { ...s, items: { ...s.items, [item.id]: { ...cur, ...partial } as EditorStarterItem } };
    });
  };

  const isVisual = item.type !== 'audio';
  const croppable = item.type === 'video' || item.type === 'image';

  return (
    <>
      <Section title={`${item.type} 属性`}>
        {isVisual ? (
          <>
            <NumberField label="X" value={item.left} onCommit={(v) => patch({ left: v })} />
            <NumberField label="Y" value={item.top} onCommit={(v) => patch({ top: v })} />
            <NumberField
              label="宽"
              value={item.width}
              min={20}
              onCommit={(v) =>
                patch(
                  aspectLocked
                    ? { width: v, height: Math.max(20, Math.round((v * item.height) / item.width)) }
                    : { width: v },
                )
              }
            />
            <NumberField
              label="高"
              value={item.height}
              min={20}
              onCommit={(v) =>
                patch(
                  aspectLocked
                    ? { height: v, width: Math.max(20, Math.round((v * item.width) / item.height)) }
                    : { height: v },
                )
              }
            />
            <Row label="锁比例">
              <Switch size="sm" checked={aspectLocked} onCheckedChange={setAspectLocked} />
            </Row>
            <Row label="旋转°">
              <NumberFieldInline value={item.rotation} onCommit={(v) => patch({ rotation: v })} />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => patch({ rotation: (item.rotation + 90) % 360 })}
                    >
                      <RotateCwIcon />
                    </Button>
                  }
                />
                <TooltipContent>旋转 90°</TooltipContent>
              </Tooltip>
            </Row>
            <NumberField
              label="透明%"
              value={Math.round(item.opacity * 100)}
              min={0}
              max={100}
              onCommit={(v) => patch({ opacity: v / 100 })}
            />
            <NumberField
              label="圆角"
              value={item.borderRadius}
              min={0}
              onCommit={(v) => patch({ borderRadius: v })}
            />
            <Row label="对齐">
              {ALIGNS.map((a) => (
                <Tooltip key={a.key}>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="flex-1"
                        onClick={() =>
                          updateUndoable((s) => {
                            const cur = s.items[item.id];
                            if (!cur) return s;
                            return {
                              ...s,
                              items: {
                                ...s.items,
                                [item.id]: {
                                  ...cur,
                                  ...a.apply(s.compositionWidth, s.compositionHeight, cur),
                                } as EditorStarterItem,
                              },
                            };
                          })
                        }
                      >
                        <a.icon />
                      </Button>
                    }
                  />
                  <TooltipContent>{a.label}</TooltipContent>
                </Tooltip>
              ))}
            </Row>
          </>
        ) : null}
        <NumberField
          label="淡入s"
          value={Number((item.fadeInDurationInFrames / fps).toFixed(2))}
          min={0}
          step={0.1}
          onCommit={(v) => patch({ fadeInDurationInFrames: Math.round(v * fps) })}
        />
        <NumberField
          label="淡出s"
          value={Number((item.fadeOutDurationInFrames / fps).toFixed(2))}
          min={0}
          step={0.1}
          onCommit={(v) => patch({ fadeOutDurationInFrames: Math.round(v * fps) })}
        />
      </Section>
      {croppable ? (
        <Section title="裁剪">
          {'crop' in item && asset && (asset.type === 'video' || asset.type === 'image') ? (
            <CropFields
              crop={item.crop}
              mediaW={asset.width}
              mediaH={asset.height}
              onChange={(crop) => patch({ crop } as Partial<EditorStarterItem>)}
            />
          ) : (
            <div className="text-xs text-muted-foreground">未裁剪</div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setItemSelectedForCrop(item.id)}
            >
              <CropIcon />
              进入裁剪
            </Button>
            {'crop' in item && item.crop ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => patch({ crop: null } as Partial<EditorStarterItem>)}
              >
                重置
              </Button>
            ) : null}
          </div>
        </Section>
      ) : null}
      {asset && asset.type !== 'caption' ? <SourceInfoSection asset={asset} /> : null}
      {item.type === 'text' ? <TextPanel item={item} /> : null}
      {item.type === 'solid' ? (
        <Section title="颜色">
          <ColorField label="颜色" value={item.color} onChange={(v) => patch({ color: v })} />
        </Section>
      ) : null}
      {item.type === 'video' || item.type === 'audio' || item.type === 'gif' ? (
        <MediaPanel item={item} />
      ) : null}
      {item.type === 'audio' || (item.type === 'video' && asset?.type === 'video' && asset.hasAudio) ? (
        <CaptionsSection itemId={item.id} />
      ) : null}
      {item.type === 'captions' ? <CaptionsPanel item={item} /> : null}
    </>
  );
};

/** 行内数字输入（无 label 布局） */
const NumberFieldInline: React.FC<{ value: number; onCommit: (v: number) => void }> = ({
  value,
  onCommit,
}) => (
  <Input
    type="number"
    className="h-7 px-2 text-right text-xs tabular-nums md:text-xs"
    defaultValue={value}
    key={value}
    onBlur={(e) => {
      const v = Number(e.target.value);
      if (!Number.isNaN(v) && v !== value) onCommit(v);
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    }}
  />
);

export const Inspector: React.FC = () => {
  const selectedItemIds = useEditorStore((s) => s.selectedItemIds);
  const items = useEditorStore((s) => s.undoable.items);

  const selected = selectedItemIds.map((id) => items[id]).filter(Boolean);

  if (selected.length === 0) return <CompositionPanel />;
  if (selected.length > 1) {
    return <div className="p-4 text-sm text-muted-foreground">已选 {selected.length} 项</div>;
  }
  return <ItemPanel item={selected[0]} />;
};
