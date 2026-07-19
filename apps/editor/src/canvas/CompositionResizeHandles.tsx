import type React from 'react';
import { useState } from 'react';
import { useEditorStore } from '../state/store';
import { SizeBadge } from './SelectionOverlay';

/**
 * 画布（合成）缩放手柄：空选中时显示在合成右缘/下缘/右下角，
 * 拖拽直接改合成尺寸（内容锚定左上；宽高取偶满足渲染要求）。
 * 官方没有此功能（仅检查器数字输入），应用户要求增加。
 */
export const CompositionResizeHandles: React.FC<{ scale: number }> = ({ scale }) => {
  const empty = useEditorStore((s) => s.selectedItemIds.length === 0);
  const w = useEditorStore((s) => s.undoable.compositionWidth);
  const h = useEditorStore((s) => s.undoable.compositionHeight);
  const [dragging, setDragging] = useState(false);
  if (!empty) return null;

  const start = (e: React.PointerEvent, dx: 0 | 1, dy: 0 | 1) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    // 锁定起始缩放：fit 模式下缩放随尺寸实时重算，锁定后拖拽手感可预测
    const s0 = scale;
    const startX = e.clientX;
    const startY = e.clientY;
    const w0 = w;
    const h0 = h;
    setDragging(true);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const onMove = (ev: PointerEvent) => {
      useEditorStore.getState().updateUndoable(
        (st) => ({
          ...st,
          compositionWidth: dx ? even(w0 + (ev.clientX - startX) / s0) : st.compositionWidth,
          compositionHeight: dy ? even(h0 + (ev.clientY - startY) / s0) : st.compositionHeight,
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

  const handleCls = 'absolute z-30 rounded-sm border border-[#0B84F3] bg-white';
  return (
    <>
      <div
        data-comp-resize="e"
        className={`${handleCls} top-1/2 -right-1.5 h-6 w-2 -translate-y-1/2 cursor-ew-resize`}
        onPointerDown={(e) => start(e, 1, 0)}
      />
      <div
        data-comp-resize="s"
        className={`${handleCls} left-1/2 -bottom-1.5 h-2 w-6 -translate-x-1/2 cursor-ns-resize`}
        onPointerDown={(e) => start(e, 0, 1)}
      />
      <div
        data-comp-resize="se"
        className={`${handleCls} -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize`}
        onPointerDown={(e) => start(e, 1, 1)}
      />
      {dragging ? <SizeBadge width={w} height={h} /> : null}
    </>
  );
};
