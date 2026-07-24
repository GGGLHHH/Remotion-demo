import type React from 'react';
import { useRef, useState } from 'react';
import type { EditorStarterItem } from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import type { EditorInstanceRefs } from '../state/instance-refs';
import { resizeRect, toDelta, topmostItemAt, toStagePoint, type Rect, type ResizeHandle } from './geometry';

type DragState =
  | { kind: 'move'; startX: number; startY: number; startRects: Map<string, Rect> }
  | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; itemId: string; startRect: Rect }
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

/** 媒体项角拖默认锁比例（官方 Shift 临时解锁）；solid/text/captions 自由缩放 */
const isMediaItem = (item: EditorStarterItem): boolean =>
  item.type === 'video' || item.type === 'image' || item.type === 'gif';

// 画布选择框拖拽状态机(move / resize / marquee 共享一个 drag ref) + 悬停描边 + 吸附辅助线。
// 从 SelectionOverlay 原样搬出;组件保留渲染、右键菜单、双击进裁剪/编辑。scale/snapping 每渲染传入。
export function useSelectionDrag(deps: {
  editorApi: EditorStoreApi;
  refs: EditorInstanceRefs;
  scale: number;
  snappingEnabled: boolean;
}) {
  const { editorApi, refs, scale, snappingEnabled } = deps;
  const drag = useRef<DragState | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const toComp = (e: React.PointerEvent) =>
    toStagePoint((e.currentTarget as HTMLElement).closest('[data-stage]')!, e.clientX, e.clientY, scale);

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const store = editorApi.getState();
    if (store.itemSelectedForCrop) return; // 裁剪模式由 CropOverlay 接管
    setHoverId(null);
    const { x, y } = toComp(e);
    const hit = topmostItemAt(store.undoable, refs.getPlayerFrame(), x, y);
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
    // setSelected 会把命中项所在组整组纳入选择;startRects 必须按展开后的完整选择建,
    // 否则「按下未选中的组成员 → 整组选中(蓝框)但本次拖拽只动被抓那个」。
    const startRects = new Map<string, Rect>();
    for (const id of editorApi.getState().selectedItemIds) {
      const it = store.undoable.items[id];
      if (it) startRects.set(id, { left: it.left, top: it.top, width: it.width, height: it.height });
    }
    drag.current = { kind: 'move', startX: e.clientX, startY: e.clientY, startRects };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const store = editorApi.getState();
    if (!d) {
      // 悬停：未选中项显示 2px 蓝色描边
      const { x, y } = toComp(e);
      const hit = topmostItemAt(store.undoable, refs.getPlayerFrame(), x, y);
      setHoverId(hit && !store.selectedItemIds.includes(hit.id) ? hit.id : null);
      return;
    }

    if (d.kind === 'marquee') {
      const { x, y } = toComp(e);
      const x1 = Math.min(d.startX, x);
      const y1 = Math.min(d.startY, y);
      const x2 = Math.max(d.startX, x);
      const y2 = Math.max(d.startY, y);
      setMarquee({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      // 触碰即预选中（松手即为最终选择）
      const f = refs.getPlayerFrame();
      const hits: string[] = [];
      for (const item of Object.values(store.undoable.items)) {
        if (item.type === 'audio') continue;
        if (f < item.from || f >= item.from + item.durationInFrames) continue;
        if (item.left < x2 && x1 < item.left + item.width && item.top < y2 && y1 < item.top + item.height) {
          hits.push(item.id);
        }
      }
      store.setSelected(hits);
      return;
    }

    let { dx, dy } = toDelta(d.startX, d.startY, e.clientX, e.clientY, scale);

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
            if (Math.abs(diff) <= tol && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, guide: t };
          }
        let bestY: { diff: number; guide: number } | null = null;
        for (const c of candY)
          for (const t of ys) {
            const diff = t - c;
            if (Math.abs(diff) <= tol && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, guide: t };
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
      const target = store.undoable.items[d.itemId];
      if (!target) return;
      const isCorner = d.handle.length === 2;
      // 官方：媒体角拖默认锁比例，Shift 临时解锁；solid/text/captions 自由缩放
      const keepAspect = isCorner && isMediaItem(target) && !e.shiftKey;
      const next = resizeRect(d.startRect, d.handle, dx, dy, keepAspect);
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
    if (d.kind !== 'marquee') editorApi.getState().commitPending();
  };

  return { marquee, guides, hoverId, setHoverId, onBackgroundPointerDown, onHandlePointerDown, onPointerMove, onPointerUp };
}
