import type React from 'react';
import { useState } from 'react';
import { useEditorStore } from '../state/store';
import { CORNERS, EDGES, SizeBadge } from './SelectionOverlay';
import type { ResizeHandle } from './geometry';

/**
 * 画布（合成）缩放手柄：空选中时显示，与画布内元素完全同款——
 * 4 个角白色方块（蓝边）+ 四条全长隐形边缘热区。
 * 只改画布尺寸、不改元素坐标（与检查器数字输入及主流工具一致）；宽高取偶（渲染要求）。
 * 官方没有此功能（仅检查器数字输入），应用户要求增加。
 */
export const CompositionResizeHandles: React.FC<{ scale: number }> = ({ scale }) => {
  const empty = useEditorStore((s) => s.selectedItemIds.length === 0);
  const w = useEditorStore((s) => s.undoable.compositionWidth);
  const h = useEditorStore((s) => s.undoable.compositionHeight);
  const [dragging, setDragging] = useState(false);
  if (!empty) return null;

  const start = (e: React.PointerEvent, handle: ResizeHandle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    // 锁定起始缩放：fit 模式下缩放随尺寸实时重算，锁定后拖拽手感可预测
    const s0 = scale;
    const startX = e.clientX;
    const startY = e.clientY;
    const st0 = useEditorStore.getState().undoable;
    const w0 = st0.compositionWidth;
    const h0 = st0.compositionHeight;
    setDragging(true);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / s0;
      const dy = (ev.clientY - startY) / s0;
      // 常见语义（Figma/Premiere/检查器数字输入一致）：只改画布尺寸，不碰元素坐标
      const newW = handle.includes('e') ? even(w0 + dx) : handle.includes('w') ? even(w0 - dx) : w0;
      const newH = handle.includes('s') ? even(h0 + dy) : handle.includes('n') ? even(h0 - dy) : h0;
      useEditorStore.getState().updateUndoable(
        (st) => ({ ...st, compositionWidth: newW, compositionHeight: newH }),
        { commit: false },
      );
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      setDragging(false);
      useEditorStore.getState().commitPending();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  return (
    <>
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 border border-[#0B84F3]" />
      ) : null}
      {EDGES.map(({ handle, cursor, style }) => (
        <div
          key={handle}
          data-comp-resize={handle}
          className="absolute z-30"
          style={{ ...style, cursor }}
          onPointerDown={(e) => start(e, handle)}
        />
      ))}
      {CORNERS.map(({ handle, x, y, cursor }) => (
        <div
          key={handle}
          data-comp-resize={handle}
          className="absolute z-30 size-2 border border-[#0B84F3] bg-white"
          style={{ left: `calc(${x * 100}% - 4px)`, top: `calc(${y * 100}% - 4px)`, cursor }}
          onPointerDown={(e) => start(e, handle)}
        />
      ))}
      {dragging ? <SizeBadge width={w} height={h} /> : null}
    </>
  );
};
