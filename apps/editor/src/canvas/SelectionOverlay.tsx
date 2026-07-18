import type React from 'react';
import { useRef } from 'react';
import type { EditorStarterItem } from '@editor/shared';
import { useEditorStore } from '../state/store';
import { resizeRect, topmostItemAt, type Rect, type ResizeHandle } from './geometry';

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

type DragState =
  | { kind: 'move'; startX: number; startY: number; startRects: Map<string, Rect> }
  | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; itemId: string; startRect: Rect };

export const SelectionOverlay: React.FC<{ scale: number; frame: number }> = ({ scale, frame }) => {
  const undoable = useEditorStore((s) => s.undoable);
  const selectedItemIds = useEditorStore((s) => s.selectedItemIds);
  const drag = useRef<DragState | null>(null);

  const toComp = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).closest('[data-stage]')!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const store = useEditorStore.getState();
    const { x, y } = toComp(e);
    const hit = topmostItemAt(store.undoable, frame, x, y);
    if (!hit) {
      store.setSelected([]);
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids: string[];
    if (additive) {
      ids = store.selectedItemIds.includes(hit.id)
        ? store.selectedItemIds.filter((i) => i !== hit.id)
        : [...store.selectedItemIds, hit.id];
      store.setSelected(ids);
      return; // 加选/减选不启动拖拽
    }
    ids = store.selectedItemIds.includes(hit.id) ? store.selectedItemIds : [hit.id];
    store.setSelected(ids);
    const startRects = new Map<string, Rect>();
    for (const id of ids) {
      const it = store.undoable.items[id];
      if (it) startRects.set(id, { left: it.left, top: it.top, width: it.width, height: it.height });
    }
    drag.current = { kind: 'move', startX: e.clientX, startY: e.clientY, startRects };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerDown = (e: React.PointerEvent, item: EditorStarterItem, handle: ResizeHandle) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    drag.current = {
      kind: 'resize',
      handle,
      startX: e.clientX,
      startY: e.clientY,
      itemId: item.id,
      startRect: { left: item.left, top: item.top, width: item.width, height: item.height },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = useEditorStore.getState();
    let dx = (e.clientX - d.startX) / scale;
    let dy = (e.clientY - d.startY) / scale;

    if (d.kind === 'move') {
      if (e.shiftKey) {
        // 锁定主轴
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      store.updateUndoable(
        (s) => {
          const items = { ...s.items };
          for (const [id, start] of d.startRects) {
            const it = items[id];
            if (!it) continue;
            items[id] = { ...it, left: Math.round(start.left + dx), top: Math.round(start.top + dy) };
          }
          return { ...s, items };
        },
        { commit: false },
      );
    } else {
      const isCorner = d.handle.length === 2;
      const next = resizeRect(d.startRect, d.handle, dx, dy, isCorner && !e.shiftKey);
      store.updateUndoable(
        (s) => {
          const it = s.items[d.itemId];
          if (!it) return s;
          return {
            ...s,
            items: {
              ...s.items,
              [d.itemId]: {
                ...it,
                left: Math.round(next.left),
                top: Math.round(next.top),
                width: Math.round(next.width),
                height: Math.round(next.height),
              },
            },
          };
        },
        { commit: false },
      );
    }
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    useEditorStore.getState().commitPending();
  };

  const selectedVisible = selectedItemIds
    .map((id) => undoable.items[id])
    .filter((it): it is EditorStarterItem => Boolean(it))
    .filter((it) => frame >= it.from && it.from + it.durationInFrames > frame);

  const single = selectedVisible.length === 1 ? selectedVisible[0] : null;

  return (
    <div
      className="absolute inset-0"
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {selectedVisible.map((item) => (
        <div
          key={item.id}
          className="pointer-events-none absolute border-2 border-blue-500"
          style={{
            left: item.left * scale,
            top: item.top * scale,
            width: item.width * scale,
            height: item.height * scale,
            rotate: `${item.rotation}deg`,
          }}
        >
          {single?.id === item.id &&
            HANDLES.map(({ handle, x, y, cursor }) => (
              <div
                key={handle}
                onPointerDown={(e) => onHandlePointerDown(e, item, handle)}
                className="pointer-events-auto absolute size-2.5 rounded-sm border border-blue-500 bg-white"
                style={{
                  left: `calc(${x * 100}% - 5px)`,
                  top: `calc(${y * 100}% - 5px)`,
                  cursor,
                }}
              />
            ))}
        </div>
      ))}
    </div>
  );
};
