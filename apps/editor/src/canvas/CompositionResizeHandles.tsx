import type React from 'react';
import { useState } from 'react';
import { useEditorStore } from '../state/store';
import { CORNERS, EDGES, SizeBadge } from './SelectionOverlay';
import type { ResizeHandle } from './geometry';

/**
 * 画布（合成）缩放手柄：空选中时显示，与画布内元素完全同款——
 * 4 个角白色方块（蓝边）+ 四条全长隐形边缘热区。
 * 拖左/上边时同步平移所有元素坐标，内容在视觉上锚定不动；宽高取偶（渲染要求）。
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
    // 元素起始坐标快照：左/上拖拽的平移始终基于快照，避免取偶累积漂移
    const items0 = new Map(Object.values(st0.items).map((i) => [i.id, { left: i.left, top: i.top }]));
    setDragging(true);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / s0;
      const dy = (ev.clientY - startY) / s0;
      const newW = handle.includes('e') ? even(w0 + dx) : handle.includes('w') ? even(w0 - dx) : w0;
      const newH = handle.includes('s') ? even(h0 + dy) : handle.includes('n') ? even(h0 - dy) : h0;
      // 左/上边移动 = 坐标原点移动：元素坐标补偿平移，内容视觉锚定不动
      const shiftX = handle.includes('w') ? newW - w0 : 0;
      const shiftY = handle.includes('n') ? newH - h0 : 0;
      useEditorStore.getState().updateUndoable(
        (st) => ({
          ...st,
          compositionWidth: newW,
          compositionHeight: newH,
          items:
            shiftX || shiftY
              ? Object.fromEntries(
                  Object.entries(st.items).map(([id, it]) => {
                    const base = items0.get(id);
                    return [
                      id,
                      base ? { ...it, left: base.left + shiftX, top: base.top + shiftY } : it,
                    ];
                  }),
                )
              : st.items,
        }),
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
