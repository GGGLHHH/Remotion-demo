import type React from 'react';
import { CropIcon } from 'lucide-react';
import type { Crop, EditorStarterItem } from '@gedatou/shared';
import { Button } from '../../components/ui/button';
import { useEditor } from '../../state/context';
import { usePlayerFrameDerived } from '../../canvas/player-ref';
import { useT } from '../../lib/i18n';
import { NumberField } from '../NumberField';
import { Section, SliderField } from '../fields';
import type { PatchFn } from '../patch';

// ---- 裁剪（官方 Crop 区：左/上/右/下四条边距滑杆，0-100%、px 读数，实时生效） ----

export const CropSection: React.FC<{
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
