import type React from 'react';
import { useState } from 'react';
import { useEditorStore } from '../state/store';
import { canvasRefitRef, suppressRefitRef } from './fit-scale';
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
    const stage = el.closest('[data-stage]') as HTMLElement | null;
    // 拖拽期间：冻结适配重算 + 锁定起始缩放——比例中途变化会让内容漂移
    suppressRefitRef.current = true;
    const s0 = scale;
    const startX = e.clientX;
    const startY = e.clientY;
    const st0 = useEditorStore.getState().undoable;
    const w0 = st0.compositionWidth;
    const h0 = st0.compositionHeight;
    // 元素起始坐标快照：左/上拖拽的补偿基于快照计算，避免取偶累积漂移
    const items0 = new Map(Object.values(st0.items).map((i) => [i.id, { left: i.left, top: i.top }]));
    setDragging(true);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / s0;
      const dy = (ev.clientY - startY) / s0;
      const newW = handle.includes('e') ? even(w0 + dx) : handle.includes('w') ? even(w0 - dx) : w0;
      const newH = handle.includes('s') ? even(h0 + dy) : handle.includes('n') ? even(h0 - dy) : h0;
      // Figma 式标准：拖左/上边 = 原点移动，改写元素坐标让内容在屏幕上纹丝不动；
      // 拖右/下边坐标天然不变。配合下方的反向位移，任何边拖拽内容都视觉静止
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
      // 舞台居中布局会把尺寸增量对半分到两侧：反向位移抵消，
      // 让被拖的边严格跟手、对边在屏幕上锚定不动（拉窗口边框的手感）
      if (stage) {
        const tx = handle.includes('e')
          ? ((newW - w0) * s0) / 2
          : handle.includes('w')
            ? -((newW - w0) * s0) / 2
            : 0;
        const ty = handle.includes('s')
          ? ((newH - h0) * s0) / 2
          : handle.includes('n')
            ? -((newH - h0) * s0) / 2
            : 0;
        stage.style.transform = `translate(${tx}px, ${ty}px)`;
      }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      if (stage) stage.style.transform = '';
      suppressRefitRef.current = false;
      canvasRefitRef.current(); // 松手后一次性恢复居中与适配
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
