import type React from 'react';
import { useState } from 'react';
import { useEditorStore } from '../state/store';
import { panRef, setPan } from './fit-scale';
import { CORNERS, EDGES, SizeBadge } from './SelectionOverlay';
import type { ResizeHandle } from './geometry';

/**
 * 画布（合成）缩放手柄：空选中时显示，与画布内元素完全同款——
 * 4 个角白色方块（蓝边）+ 四条全长隐形边缘热区。
 * 宽高取偶（渲染要求）。官方没有此功能（仅检查器数字输入），应用户要求增加。
 *
 * 自由视口下的拖拽模型：舞台原点即 pan——
 * 拖右/下边 pan 不动，对边天然锚定；拖左/上边把 pan 反向平移 −delta×scale 让被拖边跟手，
 * 同时按 Figma 语义改写元素坐标，内容在屏幕上纹丝不动。松手无任何跳变。
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
    const store = useEditorStore.getState();
    // 拖拽开始即把"适应"转为等值数字缩放：拖拽中适配值重算不再影响比例，行为可预期
    if (store.canvasZoom === 'fit') store.setCanvasZoom(scale);
    const s0 = scale;
    const startX = e.clientX;
    const startY = e.clientY;
    const st0 = store.undoable;
    const w0 = st0.compositionWidth;
    const h0 = st0.compositionHeight;
    const pan0 = { ...panRef.current };
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
      // 拖右/下边坐标天然不变
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
      // 左/上拖拽：pan 反向平移，被拖边跟手、内容与对边在屏幕上不动
      if (handle.includes('w') || handle.includes('n')) {
        setPan(pan0.x - shiftX * s0, pan0.y - shiftY * s0);
      }
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
