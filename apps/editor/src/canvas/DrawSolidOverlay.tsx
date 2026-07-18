import type React from 'react';
import { useRef, useState } from 'react';
import { useEditorStore } from '../state/store';
import { addSolidItem } from '../lib/add-items';
import type { Rect } from './geometry';

/** 无明显拖拽（<5px）视为单击 */
const CLICK_THRESHOLD_PX = 5;

/** 绘制色块模式：在画布上拖拽画框，松开按框创建色块；单击则在点击处创建默认大小色块 */
export const DrawSolidOverlay: React.FC<{ scale: number; onDone: () => void }> = ({
  scale,
  onDone,
}) => {
  const start = useRef<{ x: number; y: number; clientX: number; clientY: number } | null>(null);
  const [preview, setPreview] = useState<Rect | null>(null);

  const toComp = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const dragRect = (e: React.PointerEvent, s: { x: number; y: number }): Rect => {
    const { x, y } = toComp(e);
    return {
      left: Math.min(s.x, x),
      top: Math.min(s.y, y),
      width: Math.abs(x - s.x),
      height: Math.abs(y - s.y),
    };
  };

  return (
    <div
      className="absolute inset-0 z-30 cursor-crosshair"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const { x, y } = toComp(e);
        start.current = { x, y, clientX: e.clientX, clientY: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) setPreview(dragRect(e, start.current));
      }}
      onPointerUp={(e) => {
        const s = start.current;
        start.current = null;
        setPreview(null);
        if (!s) return;
        const dragged =
          Math.hypot(e.clientX - s.clientX, e.clientY - s.clientY) >= CLICK_THRESHOLD_PX;
        if (dragged) {
          addSolidItem(dragRect(e, s));
        } else {
          // 单击：默认大小（画布 1/3），以点击点为中心
          const { compositionWidth, compositionHeight } = useEditorStore.getState().undoable;
          const width = Math.round(compositionWidth / 3);
          const height = Math.round(compositionHeight / 3);
          addSolidItem({ left: s.x - width / 2, top: s.y - height / 2, width, height });
        }
        onDone();
      }}
      onPointerCancel={() => {
        start.current = null;
        setPreview(null);
      }}
    >
      {preview ? (
        <div
          className="pointer-events-none absolute border border-blue-400 bg-blue-500/30"
          style={{
            left: preview.left * scale,
            top: preview.top * scale,
            width: preview.width * scale,
            height: preview.height * scale,
          }}
        />
      ) : null}
    </div>
  );
};
