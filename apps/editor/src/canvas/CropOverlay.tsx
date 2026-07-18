import type React from 'react';
import { useRef } from 'react';
import type { Crop, ImageItem, VideoItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import type { ResizeHandle } from './geometry';

type CroppableItem = VideoItem | ImageItem;

const HANDLES: { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { handle: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { handle: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { handle: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { handle: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { handle: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { handle: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { handle: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { handle: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

/** 裁剪模式：拖 8 手柄同时改 item 框与 crop；拖中间平移 crop（画面固定）。Esc/点外部退出 */
export const CropOverlay: React.FC<{ scale: number }> = ({ scale }) => {
  const itemId = useEditorStore((s) => s.itemSelectedForCrop);
  const item = useEditorStore((s) => (itemId ? s.undoable.items[itemId] : null)) as
    | CroppableItem
    | null;
  const asset = useEditorStore((s) =>
    item && 'assetId' in item ? s.undoable.assets[item.assetId] : undefined,
  );
  const localUrl = useEditorStore((s) => (item ? s.localUrls[item.assetId] : undefined));
  const drag = useRef<{
    mode: ResizeHandle | 'pan';
    startX: number;
    startY: number;
    startCrop: Crop;
    startRect: { left: number; top: number; width: number; height: number };
  } | null>(null);

  if (!item || (item.type !== 'video' && item.type !== 'image') || !asset || !('width' in asset)) {
    return null;
  }

  const crop: Crop = item.crop ?? { left: 0, top: 0, width: asset.width, height: asset.height };
  const scaleX = item.width / crop.width;
  const scaleY = item.height / crop.height;
  // 全图区域（合成坐标）
  const full = {
    left: item.left - crop.left * scaleX,
    top: item.top - crop.top * scaleY,
    width: asset.width * scaleX,
    height: asset.height * scaleY,
  };

  const exit = () => useEditorStore.getState().setItemSelectedForCrop(null);

  const start = (e: React.PointerEvent, mode: ResizeHandle | 'pan') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: crop,
      startRect: { left: item.left, top: item.top, width: item.width, height: item.height },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const store = useEditorStore.getState();

    store.updateUndoable(
      (s) => {
        const cur = s.items[item.id] as CroppableItem | undefined;
        if (!cur) return s;
        const c = { ...d.startCrop };
        const r = { ...d.startRect };
        const MIN = 20;

        if (d.mode === 'pan') {
          // 画面窗口固定，平移取景（crop 反向移动）
          c.left = Math.min(Math.max(0, d.startCrop.left - dx / scaleX), asset.width - c.width);
          c.top = Math.min(Math.max(0, d.startCrop.top - dy / scaleY), asset.height - c.height);
        } else {
          if (d.mode.includes('e')) {
            const maxW = (asset.width - c.left) * scaleX;
            r.width = Math.min(Math.max(MIN, d.startRect.width + dx), maxW);
            c.width = r.width / scaleX;
          }
          if (d.mode.includes('s')) {
            const maxH = (asset.height - c.top) * scaleY;
            r.height = Math.min(Math.max(MIN, d.startRect.height + dy), maxH);
            c.height = r.height / scaleY;
          }
          if (d.mode.includes('w')) {
            const maxShift = d.startCrop.left * scaleX; // 不能超过全图左缘
            const shift = Math.min(Math.max(dx, -maxShift), d.startRect.width - MIN);
            r.left = d.startRect.left + shift;
            r.width = d.startRect.width - shift;
            c.left = d.startCrop.left + shift / scaleX;
            c.width = r.width / scaleX;
          }
          if (d.mode.includes('n')) {
            const maxShift = d.startCrop.top * scaleY;
            const shift = Math.min(Math.max(dy, -maxShift), d.startRect.height - MIN);
            r.top = d.startRect.top + shift;
            r.height = d.startRect.height - shift;
            c.top = d.startCrop.top + shift / scaleY;
            c.height = r.height / scaleY;
          }
        }
        return {
          ...s,
          items: {
            ...s.items,
            [item.id]: {
              ...cur,
              left: Math.round(r.left),
              top: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
              crop: {
                left: Math.round(c.left),
                top: Math.round(c.top),
                width: Math.round(c.width),
                height: Math.round(c.height),
              },
            },
          },
        };
      },
      { commit: false },
    );
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    useEditorStore.getState().commitPending();
  };

  const ghostUrl = asset.type === 'image' ? (localUrl ?? asset.url) : null;

  return (
    <div
      className="absolute inset-0 z-20"
      onPointerDown={(e) => {
        // 点在裁剪框外 ⇒ 退出
        exit();
        void e;
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* 全图幽灵层 */}
      <div
        className="pointer-events-none absolute border border-dashed border-white/40"
        style={{
          left: full.left * scale,
          top: full.top * scale,
          width: full.width * scale,
          height: full.height * scale,
        }}
      >
        {ghostUrl ? (
          <img src={ghostUrl} className="size-full object-fill opacity-40" alt="" />
        ) : (
          <div className="size-full bg-white/10" />
        )}
      </div>
      {/* 裁剪窗口 */}
      <div
        className="absolute cursor-move border-2 border-amber-400"
        style={{
          left: item.left * scale,
          top: item.top * scale,
          width: item.width * scale,
          height: item.height * scale,
        }}
        onPointerDown={(e) => start(e, 'pan')}
      >
        {HANDLES.map(({ handle, x, y, cursor }) => (
          <div
            key={handle}
            onPointerDown={(e) => start(e, handle)}
            className="absolute size-2.5 rounded-sm border border-amber-400 bg-white"
            style={{ left: `calc(${x * 100}% - 5px)`, top: `calc(${y * 100}% - 5px)`, cursor }}
          />
        ))}
      </div>
    </div>
  );
};
