import type React from 'react';
import { useRef, useState } from 'react';
import type { EditorStarterItem } from '@gedatou/shared';
import type { EditorStoreApi } from '../state/store';
import type { EditorInstanceRefs } from '../state/instance-refs';
import { addTrack, removeEmptyTracks, resolveInsertPlacement, snapFrame } from './ops';
import { rowTops, trackIndexAtY } from './geometry';
import { RULER_HEIGHT, SNAP_TOLERANCE_PX } from './constants';
import type { MoveDrag, MoveVisual, TrackTarget } from './types';

/** 行间边界 ±4px ⇒ 插入新轨道 */
const TRACK_GAP_PX = 4;
/** 视口左右边缘自动滚动：触发范围与步长 */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 24;

// 时间线「移动拖拽」状态机(官方模型:拖拽中不改 store,视觉全在本地 state,松手一次性提交)。
// 自成一体:私有 moveRef/moveCleanupRef/moveVisual + window 级监听 + 边缘自动滚动 + Esc 取消。
// 从 TimelinePanel 原样搬出;入口 startMove(item, e) 由块 pointerdown 的 move 分支调用。
export function useMoveDrag(deps: {
  editorApi: EditorStoreApi;
  refs: EditorInstanceRefs;
  panelRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  zoomRef: React.RefObject<number>;
}) {
  const { editorApi, refs, panelRef, contentRef, scrollRef, zoomRef } = deps;
  const moveRef = useRef<MoveDrag | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const [moveVisual, setMoveVisual] = useState<MoveVisual | null>(null);

  /** 结束移动拖拽；apply=true 时一次性提交落位（永不回弹），Esc/取消则不动 store */
  const endMoveDrag = (apply: boolean) => {
    moveCleanupRef.current?.();
    moveCleanupRef.current = null;
    const d = moveRef.current;
    moveRef.current = null;
    setMoveVisual(null);
    if (!apply || !d?.moved || !d.placement) return;
    const store = editorApi.getState();
    const item = store.undoable.items[d.id];
    if (!item) return;
    const { target, from, shifts } = d.placement;
    const hasShifts = shifts && Object.keys(shifts).length > 0;
    // 位置没变且无重排就不进撤销栈
    if (
      !hasShifts &&
      target.kind === 'existing' &&
      store.undoable.tracks[target.index]?.id === item.trackId &&
      from === item.from
    ) {
      return;
    }
    store.updateUndoable((s) => {
      let st = s;
      let trackId: string;
      if (target.kind === 'insert') {
        const added = addTrack(st, target.index);
        st = added.state;
        trackId = added.trackId;
      } else {
        trackId = st.tracks[target.index]?.id ?? item.trackId;
      }
      const items = { ...st.items };
      // 插入模式:先把被顶开的其他块右推,再落被拖块
      if (shifts) {
        for (const [id, nf] of Object.entries(shifts)) {
          if (items[id]) items[id] = { ...items[id], from: nf };
        }
      }
      items[d.id] = { ...items[d.id], trackId, from };
      st = { ...st, items };
      return removeEmptyTracks(st);
    });
  };

  /** 每次指针移动/自动滚动 tick：重算幽灵位置、轨道目标与落位槽（不改 store） */
  const moveTick = (clientX: number, clientY: number) => {
    const d = moveRef.current;
    const contentEl = contentRef.current;
    const panelEl = panelRef.current;
    if (!d || !contentEl || !panelEl) return;
    d.lastClientX = clientX;
    d.lastClientY = clientY;
    if (!d.moved) {
      // 3px 阈值：区分点击与拖拽
      if (Math.abs(clientX - d.downX) < 3 && Math.abs(clientY - d.downY) < 3) return;
      d.moved = true;
    }
    const store = editorApi.getState();
    const st = store.undoable;
    const item = st.items[d.id];
    if (!item) {
      endMoveDrag(false);
      return;
    }
    const z = zoomRef.current;
    const cRect = contentEl.getBoundingClientRect();
    const x = clientX - cRect.left;
    const y = clientY - cRect.top;

    // 轨道目标（按原始布局判定；虚拟行只是渲染层的事）：
    // 标尺及以上 ⇒ 顶部新轨道；底行以下 ⇒ 底部新轨道；行间 ±4px ⇒ 插入条；否则现有行
    const n = st.tracks.length;
    const tops = rowTops(st);
    let target: TrackTarget;
    if (y < RULER_HEIGHT) {
      target = { kind: 'insert', index: 0, bar: false };
    } else if (y >= tops[n]) {
      target = { kind: 'insert', index: n, bar: false };
    } else {
      const row = trackIndexAtY(st, y);
      const distTop = y - tops[row];
      const distBottom = tops[row + 1] - y;
      if (row > 0 && distTop <= TRACK_GAP_PX) target = { kind: 'insert', index: row, bar: true };
      else if (row < n - 1 && distBottom <= TRACK_GAP_PX) target = { kind: 'insert', index: row + 1, bar: true };
      else target = { kind: 'existing', index: row };
    }

    // 被拖块左缘(自由落位用)+ 光标所在帧(决策用,以鼠标位置为主)
    let desired = Math.round((x - d.grabDX) / z);
    const cursorFrame = Math.round(x / z);
    let guideFrame: number | null = null;
    if (store.snappingEnabled) {
      const tol = Math.max(1, Math.round(SNAP_TOLERANCE_PX / z));
      const opts = {
        playheadFrame: refs.player.current?.getCurrentFrame() ?? undefined,
        ignoreIds: [d.id],
      };
      const leftSnap = snapFrame(st, desired, tol, opts);
      const rightSnap = snapFrame(st, desired + item.durationInFrames, tol, opts);
      const dl = leftSnap - desired;
      const dr = rightSnap - (desired + item.durationInFrames);
      if (dl !== 0 && (dr === 0 || Math.abs(dl) <= Math.abs(dr))) {
        desired += dl;
        guideFrame = leftSnap;
      } else if (dr !== 0) {
        desired += dr;
        guideFrame = rightSnap;
      }
    }

    const trackRef =
      target.kind === 'existing'
        ? { kind: 'existing' as const, id: st.tracks[target.index].id }
        : { kind: 'insert' as const, index: target.index };
    // 以光标为主的方向感知放置:落点即插入边界 ⇒ 引导线画在落点(覆盖吸附线)
    const r = resolveInsertPlacement(st, d.id, cursorFrame, desired, trackRef);
    const from = r.from;
    guideFrame = from;
    d.placement = { target, from, shifts: r.shifts };

    // 过半阈值线:光标点命中某块时,画该块中线——越过它,插到该块前/后翻转;命中不到(空处)不显示。
    let thresholdFrame: number | null = null;
    if (trackRef.kind === 'existing') {
      const pivot = Object.values(st.items).find(
        (o) =>
          o.trackId === trackRef.id &&
          o.id !== d.id &&
          o.from <= cursorFrame &&
          cursorFrame < o.from + o.durationInFrames,
      );
      if (pivot) thresholdFrame = pivot.from + pivot.durationInFrames / 2;
    }

    const pRect = panelEl.getBoundingClientRect();
    setMoveVisual({
      id: d.id,
      ghostX: clientX - pRect.left - d.grabDX,
      ghostY: clientY - pRect.top - d.grabDY,
      target,
      slotFrom: from,
      guideFrame,
      thresholdFrame,
    });
  };

  /** 挂 window 级监听（跨行/出面板不丢事件）+ 边缘自动滚动 + Esc 取消 */
  const startMoveDrag = () => {
    const onMove = (ev: PointerEvent) => moveTick(ev.clientX, ev.clientY);
    const onUp = () => endMoveDrag(true);
    const onCancel = () => endMoveDrag(false);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') endMoveDrag(false);
    };
    const timer = window.setInterval(() => {
      const el = scrollRef.current;
      const d = moveRef.current;
      if (!el || !d || !d.moved) return;
      const r = el.getBoundingClientRect();
      let step = 0;
      if (d.lastClientX < r.left + AUTO_SCROLL_EDGE_PX) step = -AUTO_SCROLL_STEP_PX;
      else if (d.lastClientX > r.right - AUTO_SCROLL_EDGE_PX) step = AUTO_SCROLL_STEP_PX;
      if (step === 0) return;
      const before = el.scrollLeft;
      el.scrollLeft = Math.max(0, before + step);
      if (el.scrollLeft !== before) moveTick(d.lastClientX, d.lastClientY);
    }, 50);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    moveCleanupRef.current = () => {
      window.clearInterval(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
  };

  /** 块 pointerdown 的 move 分支入口:记录抓取偏移 + 启动 window 拖拽 */
  const startMove = (item: EditorStarterItem, e: React.PointerEvent) => {
    const blockEl = e.currentTarget as HTMLElement;
    const blockRect = blockEl.getBoundingClientRect();
    // 行顶取块的父级行元素（不写死块的 inset，行高/块内边距变化都不受影响）
    const rowTop = blockEl.parentElement?.getBoundingClientRect().top ?? blockRect.top;
    moveRef.current = {
      id: item.id,
      downX: e.clientX,
      downY: e.clientY,
      grabDX: e.clientX - blockRect.left,
      grabDY: e.clientY - rowTop,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      placement: null,
    };
    startMoveDrag();
  };

  return { moveVisual, startMove };
}
