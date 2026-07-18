import type React from 'react';
import { useRef, useState } from 'react';
import type { EditorStarterItem } from '@editor/shared';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useEditorStore } from '../state/store';
import { addTrack, moveItems, removeEmptyTracks } from '../timeline/ops';
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
  | {
      kind: 'resize';
      handle: ResizeHandle;
      startX: number;
      startY: number;
      itemId: string;
      startRect: Rect;
    }
  | { kind: 'marquee'; startX: number; startY: number };

type Guide = { axis: 'x' | 'y'; pos: number };

/** 吸附候选：画布边缘/中心 + 其他可见 item 边缘/中心 */
const snapCandidates = (
  state: { compositionWidth: number; compositionHeight: number },
  others: EditorStarterItem[],
) => {
  const xs = [0, state.compositionWidth / 2, state.compositionWidth];
  const ys = [0, state.compositionHeight / 2, state.compositionHeight];
  for (const o of others) {
    xs.push(o.left, o.left + o.width / 2, o.left + o.width);
    ys.push(o.top, o.top + o.height / 2, o.top + o.height);
  }
  return { xs, ys };
};

export const SelectionOverlay: React.FC<{ scale: number; frame: number }> = ({ scale, frame }) => {
  const undoable = useEditorStore((s) => s.undoable);
  const selectedItemIds = useEditorStore((s) => s.selectedItemIds);
  const snappingEnabled = useEditorStore((s) => s.snappingEnabled);
  const drag = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  /** 右键命中的 item（菜单动作目标）；菜单开合由 ContextMenu 组件管理 */
  const menuItemId = useRef<string | null>(null);

  const toComp = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).closest('[data-stage]')!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const store = useEditorStore.getState();
    if (store.itemSelectedForCrop) return; // 裁剪模式由 CropOverlay 接管
    const { x, y } = toComp(e);
    const hit = topmostItemAt(store.undoable, frame, x, y);
    if (!hit) {
      store.setSelected([]);
      drag.current = { kind: 'marquee', startX: x, startY: y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids: string[];
    if (additive) {
      ids = store.selectedItemIds.includes(hit.id)
        ? store.selectedItemIds.filter((i) => i !== hit.id)
        : [...store.selectedItemIds, hit.id];
      store.setSelected(ids);
      return;
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

  const onDoubleClick = (e: React.MouseEvent) => {
    const store = useEditorStore.getState();
    const { x, y } = toComp(e);
    const hit = topmostItemAt(store.undoable, frame, x, y);
    if (!hit) return;
    if (hit.type === 'text') store.setTextItemEditing(hit.id);
    else if (hit.type === 'video' || hit.type === 'image') store.setItemSelectedForCrop(hit.id);
  };

  /** 置顶/置底：移到新建的最上/最下轨道，再清理空轨道 */
  const reorder = (where: 'front' | 'back') => {
    const itemId = menuItemId.current;
    if (!itemId) return;
    const store = useEditorStore.getState();
    store.updateUndoable((s) => {
      const item = s.items[itemId];
      if (!item) return s;
      const { state: st, trackId } = addTrack(s, where === 'front' ? 0 : s.tracks.length);
      const moved = moveItems(st, [{ id: itemId, trackId, from: item.from }]);
      if (moved === st) return s;
      return removeEmptyTracks(moved);
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = useEditorStore.getState();

    if (d.kind === 'marquee') {
      const { x, y } = toComp(e);
      const x1 = Math.min(d.startX, x);
      const y1 = Math.min(d.startY, y);
      const x2 = Math.max(d.startX, x);
      const y2 = Math.max(d.startY, y);
      setMarquee({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      const hits: string[] = [];
      for (const item of Object.values(store.undoable.items)) {
        if (item.type === 'audio') continue;
        if (frame < item.from || frame >= item.from + item.durationInFrames) continue;
        if (item.left < x2 && x1 < item.left + item.width && item.top < y2 && y1 < item.top + item.height) {
          hits.push(item.id);
        }
      }
      store.setSelected(hits);
      return;
    }

    let dx = (e.clientX - d.startX) / scale;
    let dy = (e.clientY - d.startY) / scale;

    if (d.kind === 'move') {
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      // 吸附（以第一个选中项为基准）
      const newGuides: Guide[] = [];
      if (snappingEnabled && d.startRects.size > 0) {
        const [primaryId, primary] = [...d.startRects.entries()][0];
        const others = Object.values(store.undoable.items).filter(
          (it) => !d.startRects.has(it.id) && it.type !== 'audio',
        );
        const { xs, ys } = snapCandidates(store.undoable, others);
        const tol = 8 / scale;
        const candX = [primary.left + dx, primary.left + primary.width / 2 + dx, primary.left + primary.width + dx];
        const candY = [primary.top + dy, primary.top + primary.height / 2 + dy, primary.top + primary.height + dy];
        let bestX: { diff: number; guide: number } | null = null;
        for (const c of candX)
          for (const t of xs) {
            const diff = t - c;
            if (Math.abs(diff) <= tol && (!bestX || Math.abs(diff) < Math.abs(bestX.diff)))
              bestX = { diff, guide: t };
          }
        let bestY: { diff: number; guide: number } | null = null;
        for (const c of candY)
          for (const t of ys) {
            const diff = t - c;
            if (Math.abs(diff) <= tol && (!bestY || Math.abs(diff) < Math.abs(bestY.diff)))
              bestY = { diff, guide: t };
          }
        if (bestX) {
          dx += bestX.diff;
          newGuides.push({ axis: 'x', pos: bestX.guide });
        }
        if (bestY) {
          dy += bestY.diff;
          newGuides.push({ axis: 'y', pos: bestY.guide });
        }
        void primaryId;
      }
      setGuides(newGuides);
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

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarquee(null);
    setGuides([]);
    if (!d) return;
    if (d.kind !== 'marquee') useEditorStore.getState().commitPending();
  };

  const selectedVisible = selectedItemIds
    .map((id) => undoable.items[id])
    .filter((it): it is EditorStarterItem => Boolean(it) && it.type !== 'audio')
    .filter((it) => frame >= it.from && it.from + it.durationInFrames > frame);

  const single = selectedVisible.length === 1 ? selectedVisible[0] : null;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="absolute inset-0"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          // 仅在命中 item 时弹菜单；空白处右键既不弹菜单也不弹系统菜单
          const store = useEditorStore.getState();
          const { x, y } = toComp(e);
          const hit = topmostItemAt(store.undoable, frame, x, y);
          if (!hit) {
            e.preventDefault();
            e.preventBaseUIHandler();
            return;
          }
          store.setSelected([hit.id]);
          menuItemId.current = hit.id;
        }}
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
                style={{ left: `calc(${x * 100}% - 5px)`, top: `calc(${y * 100}% - 5px)`, cursor }}
              />
            ))}
        </div>
      ))}
      {guides.map((g, i) => (
        <div
          key={i}
          className="pointer-events-none absolute bg-red-500/80"
          style={
            g.axis === 'x'
              ? { left: g.pos * scale, top: 0, bottom: 0, width: 1 }
              : { top: g.pos * scale, left: 0, right: 0, height: 1 }
          }
        />
      ))}
      {marquee ? (
        <div
          className="pointer-events-none absolute border border-blue-400 bg-blue-400/10"
          style={{
            left: marquee.x * scale,
            top: marquee.y * scale,
            width: marquee.w * scale,
            height: marquee.h * scale,
          }}
        />
      ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => reorder('front')}>置于顶层</ContextMenuItem>
        <ContextMenuItem onClick={() => reorder('back')}>置于底层</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
