import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EditorStarterItem, Transition } from '@gedatou/shared';
import { cn } from '../lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../components/ui/context-menu';
import { useEditor, useEditorApi, useEditorDeps, useEditorRefs } from '../state/context';
import { usePlayerFrameDerived } from '../canvas/player-ref';
import { calcDuration } from '@gedatou/shared/composition';
import {
  HEADER_WIDTH,
  RULER_HEIGHT,
  SNAP_TOLERANCE_PX,
  TRACK_HEIGHT,
} from './constants';
import { Playhead } from './Playhead';
import { Ruler } from './Ruler';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineGhost, TimelineOverlays } from './TimelineOverlays';
import { TimelineTracks } from './TimelineTracks';
import { TrackHeader } from './TrackHeader';
import type { DragState, MoveDrag, MoveVisual, TrackTarget } from './types';
import {
  addTrack,
  bringToFront,
  removeEmptyTracks,
  resolveMovePlacement,
  resolveSplitTargets,
  rollEdit,
  sendToBack,
  snapFrame,
  splitItemsAtFrame,
  trimItem,
} from './ops';
import { rowHeightOf, rowTops, trackIndexAtY } from './geometry';
import { importFiles } from '../lib/import-assets';
import { copySelection, duplicateSelection } from '../lib/clipboard';
import { addTransition, applyTransitionDuration } from '../lib/transition-ops';
import { useT } from '../lib/i18n';

/** 修剪吸附阈值（官方约 10px） */
const TRIM_SNAP_PX = 10;
/** 行间边界 ±4px ⇒ 插入新轨道 */
const TRACK_GAP_PX = 4;
/** 视口左右边缘自动滚动：触发范围与步长 */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 24;

export const TimelinePanel: React.FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  const editorApi = useEditorApi();
  const deps = useEditorDeps();
  const refs = useEditorRefs();
  const undoable = useEditor((s) => s.undoable);
  const zoomSetting = useEditor((s) => s.timelineZoom);
  const setZoom = useEditor((s) => s.setTimelineZoom);
  const height = useEditor((s) => s.timelineHeight);
  const setHeight = useEditor((s) => s.setTimelineHeight);
  const snapping = useEditor((s) => s.snappingEnabled);
  const selectedIds = useEditor((s) => s.selectedItemIds);
  // transitions 是加法字段：消费方(如 workbench-v2)可能持有早于该字段的 state，缺省为空表
  const transitions = useEditor((s) => s.undoable.transitions) ?? ({} as Record<string, Transition>);
  const selectedTransitionId = useEditor((s) => s.selectedTransitionId);

  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  /** 修剪拖拽中的项（用于最大可扩展指示） */
  const [trimming, setTrimming] = useState<{ id: string; edge: 'start' | 'end' } | null>(null);
  /** 修剪吸附线（帧） */
  const [trimGuide, setTrimGuide] = useState<number | null>(null);
  /** OS 文件拖放悬停位置 */
  const [dropHint, setDropHint] = useState<{ frame: number; trackIndex: number } | null>(null);

  // ---- 移动拖拽（官方模型：store 不动，视觉全在本地 state）----
  const moveRef = useRef<MoveDrag | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const [moveVisual, setMoveVisual] = useState<MoveVisual | null>(null);

  /** 右键命中的块（菜单动作目标）；菜单开合由 ContextMenu 组件管理 */
  const menuItemId = useRef<string | null>(null);

  const duration = calcDuration(undoable.items);

  // ---- 有效缩放（唯一出口）：'fit' ⇒ 内容撑满可视宽度，随面板宽度/内容时长自动重算 ----
  const [viewW, setViewW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitZoom = Math.min(8, Math.max(0.1, viewW / Math.max(1, duration)));
  const zoom = zoomSetting === 'fit' ? fitZoom : zoomSetting;
  /** 供拖拽 window 监听/播放跟随读取的最新有效缩放 */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // fit 模式内容刚好占满（无横向滚动）；数字模式末尾留 240px 拖拽余量
  const contentWidth = Math.max(duration * zoom + (zoomSetting === 'fit' ? 0 : 240), viewW);
  // 剪刀按钮：播放头没有落在任何可分割目标内部时禁用（官方行为）。
  // 派生订阅：仅布尔值翻转时才重渲面板（播放中不再 30 次/秒全量重渲）
  const splittable = usePlayerFrameDerived((f) =>
    resolveSplitTargets(undoable, f, selectedIds).some((id) => {
      const it = undoable.items[id];
      return it !== undefined && f > it.from && f < it.from + it.durationInFrames;
    }),
  );

  // 播放头跟随 + 播放时自动滚动（不与用户的手动滚动抢方向盘）。
  // 直接改 scrollLeft，不进 React state——播放中零重渲
  const lastPlayheadX = useRef<number | null>(null);
  useEffect(() => {
    const p = refs.player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      const el = scrollRef.current;
      if (el && p.isPlaying()) {
        const x = e.detail.frame * zoomRef.current;
        const last = lastPlayheadX.current;
        lastPlayheadX.current = x;
        const rightEdge = el.scrollLeft + el.clientWidth - 40;
        if (last !== null && x < last) {
          // 播放头回跳（循环重播）：视口跟回
          el.scrollLeft = Math.max(0, x - 80);
        } else if (last !== null && last <= rightEdge && x > rightEdge) {
          // 播放头刚越过右缘：向前翻页；用户已滚远时（上帧就在缘外）不触发
          el.scrollLeft = Math.max(0, x - 80);
        }
      } else {
        lastPlayheadX.current = null;
      }
    };
    p.addEventListener('frameupdate', onFrame);
    return () => p.removeEventListener('frameupdate', onFrame);
  }, []);

  // seek 触发 frameupdate，播放头/时间码各自订阅更新，这里无需本地 state
  const seekTo = (f: number) => {
    refs.player.current?.pause();
    refs.player.current?.seekTo(Math.max(0, f));
  };

  // ---- 移动拖拽 ----

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
    const { target, from } = d.placement;
    // 位置没变就不进撤销栈
    if (
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
      st = { ...st, items: { ...st.items, [d.id]: { ...st.items[d.id], trackId, from } } };
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
      else if (row < n - 1 && distBottom <= TRACK_GAP_PX)
        target = { kind: 'insert', index: row + 1, bar: true };
      else target = { kind: 'existing', index: row };
    }

    // 期望帧 + 吸附（左右端取更近者；吸附成立时显示贯穿竖线）
    let desired = Math.round((x - d.grabDX) / z);
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
    const { from } = resolveMovePlacement(st, d.id, desired, trackRef);
    // 被占位块顶开/钳制后吸附边不再成立 ⇒ 撤掉吸附线
    if (from !== desired) guideFrame = null;

    d.placement = { target, from };
    const pRect = panelEl.getBoundingClientRect();
    setMoveVisual({
      id: d.id,
      ghostX: clientX - pRect.left - d.grabDX,
      ghostY: clientY - pRect.top - d.grabDY,
      target,
      slotFrom: from,
      guideFrame,
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

  // ---- 修剪/框选拖拽 ----

  const onItemPointerDownImpl = (
    e: React.PointerEvent,
    item: EditorStarterItem,
    mode: 'move' | 'trim-start' | 'trim-end',
  ) => {
    if (e.button !== 0) return;
    const store = editorApi.getState();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (mode === 'trim-start' || mode === 'trim-end') {
      const edge = mode === 'trim-start' ? 'start' : 'end';
      // 官方：按下修剪手柄立即独占选中该项（mousedown 即生效，无需移动）
      store.setSelected([item.id]);
      drag.current = {
        kind: 'trim',
        edge,
        id: item.id,
        startX: e.clientX,
        snapshot: store.undoable,
        rollingNeighborId: null,
        moved: false,
      };
      setTrimming({ id: item.id, edge });
      return;
    }

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      const ids = store.selectedItemIds.includes(item.id)
        ? store.selectedItemIds.filter((i) => i !== item.id)
        : [...store.selectedItemIds, item.id];
      store.setSelected(ids);
      return;
    }
    store.setSelected(store.selectedItemIds.includes(item.id) ? store.selectedItemIds : [item.id]);
    // 官方行为：多选时拖拽也只移动被抓的块
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

  /** 引用恒定的块按下回调（useEvent 模式）：配合 memo(ItemBlock) 跳过无关重渲 */
  const onItemPointerDownRef = useRef(onItemPointerDownImpl);
  onItemPointerDownRef.current = onItemPointerDownImpl;
  const onItemPointerDown = useCallback(
    (e: React.PointerEvent, item: EditorStarterItem, mode: 'move' | 'trim-start' | 'trim-end') =>
      onItemPointerDownRef.current(e, item, mode),
    [],
  );

  /** 相邻块边界滚动编辑（官方：4px ew-resize 热区，无需修饰键）：A 出点 + B 入点联动 */
  const onRollPointerDown = (e: React.PointerEvent, aId: string, bId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      kind: 'trim',
      edge: 'end',
      id: aId,
      startX: e.clientX,
      snapshot: editorApi.getState().undoable,
      rollingNeighborId: bId,
      moved: false,
    };
  };

  /** 转场 pill 拖拽调时长（手柄小拖拽骨架，同 ItemBlock 的 startHandleDrag）：
      指针 x → 内容坐标帧号，newDur = A 出点 − 该帧（钳制在 op 内做），松手一次性提交 */
  const onTransitionPointerDown = (e: React.PointerEvent, tr: Transition, a: EditorStarterItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    editorApi.getState().setSelectedTransition(tr.id);
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const aEnd = a.from + a.durationInFrames;
    const onMove = (ev: PointerEvent) => {
      const cRect = contentRef.current?.getBoundingClientRect();
      if (!cRect) return;
      const frameAtPointer = (ev.clientX - cRect.left) / zoomRef.current;
      applyTransitionDuration(editorApi, tr.id, Math.round(aEnd - frameAtPointer), false);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      editorApi.getState().commitPending();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const store = editorApi.getState();

    if (d.kind === 'trim') {
      // 3px 阈值：区分 roll 热区的点击（建转场）与真实拖拽（roll 编辑）
      if (!d.moved && Math.abs(e.clientX - d.startX) >= 3) d.moved = true;
      // roll 热区在越过阈值前不写 store：否则 sub-3px 抖动会先 commit:false 一次微 roll，
      // pointerup 时 addTransition 又读到这个已被污染的状态、commitPending 再补一条——
      // 一次点击炸出两条乱序 past。普通 trim（rollingNeighborId 为 null）不受影响。
      if (d.rollingNeighborId && !d.moved) return;
      // 官方：按住 Shift 完全抑制修剪（边缘回到起拖位置，松开恢复）
      if (e.shiftKey) {
        setTrimGuide(null);
        store.updateUndoable(() => d.snapshot, { commit: false });
        return;
      }
      let delta = Math.round((e.clientX - d.startX) / zoom);
      const orig = d.snapshot.items[d.id];
      let guide: number | null = null;
      if (snapping && orig) {
        // 修剪吸附（官方约 10px 阈值）：以被拖的边缘为准；播放头不是修剪吸附目标
        const tol = Math.max(1, Math.round(TRIM_SNAP_PX / zoom));
        const edgeFrame =
          d.edge === 'start' ? orig.from + delta : orig.from + orig.durationInFrames + delta;
        const ignoreIds = d.rollingNeighborId ? [d.id, d.rollingNeighborId] : [d.id];
        const snapped = snapFrame(d.snapshot, edgeFrame, tol, { ignoreIds });
        if (snapped !== edgeFrame) {
          delta += snapped - edgeFrame;
          guide = snapped;
        }
      }
      setTrimGuide(guide);
      store.updateUndoable(
        () =>
          d.rollingNeighborId
            ? rollEdit(d.snapshot, d.id, d.rollingNeighborId, delta)
            : trimItem(d.snapshot, d.id, d.edge, delta),
        { commit: false },
      );
      return;
    }

    // marquee
    d.curX = e.clientX;
    d.curY = e.clientY;
    const host = scrollRef.current!.getBoundingClientRect();
    const x1 = Math.min(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft;
    const x2 = Math.max(d.startX, d.curX) - host.left + scrollRef.current!.scrollLeft;
    const y1 = Math.min(d.startY, d.curY) - host.top;
    const y2 = Math.max(d.startY, d.curY) - host.top;
    setMarqueeRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    // 命中：帧区间 × 轨道行相交
    const f1 = x1 / zoom;
    const f2 = x2 / zoom;
    const r1 = trackIndexAtY(store.undoable, y1);
    const r2 = trackIndexAtY(store.undoable, y2);
    const hit: string[] = [];
    for (const item of Object.values(store.undoable.items)) {
      const idx = store.undoable.tracks.findIndex((t) => t.id === item.trackId);
      if (idx < r1 || idx > r2) continue;
      if (item.from < f2 && f1 < item.from + item.durationInFrames) hit.push(item.id);
    }
    store.setSelected(hit);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setMarqueeRect(null);
    setTrimming(null);
    setTrimGuide(null);
    if (!d) return;
    if (d.kind === 'trim') {
      // roll 热区点击（未越过拖拽阈值）且该切点尚无转场 ⇒ 建转场；真实拖拽（moved）仍按原逻辑提交 roll 编辑
      const bId = d.rollingNeighborId;
      if (bId && !d.moved) {
        const exists = Object.values(editorApi.getState().undoable.transitions ?? {}).some(
          (tr) => tr.fromItemId === d.id && tr.toItemId === bId,
        );
        if (!exists) addTransition(editorApi, d.id, bId);
      }
      editorApi.getState().commitPending();
    }
  };

  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-item-block]')) return;
    editorApi.getState().setSelected([]);
    drag.current = { kind: 'marquee', startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  // ---- OS 文件拖放 ----

  /** clientX/Y → 帧 + 轨道行（考虑滚动与缩放） */
  const dropInfo = (e: React.DragEvent) => {
    const host = scrollRef.current!;
    const rect = host.getBoundingClientRect();
    const x = e.clientX - rect.left + host.scrollLeft;
    const y = e.clientY - rect.top;
    return {
      frame: Math.max(0, Math.round(x / zoom)),
      trackIndex: trackIndexAtY(undoable, y),
    };
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDropHint(dropInfo(e));
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropHint(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const { frame, trackIndex } = dropInfo(e);
    void importFiles(editorApi, deps, files, undefined, { frame, trackId: undoable.tracks[trackIndex]?.id }, refs.getPlayerFrame());
  };

  // ---- 块右键菜单 ----

  /** 剪切 = 复制到内部剪贴板 + 删除选中（与 Cmd+X 一致） */
  const menuCut = () => {
    copySelection(editorApi);
    editorApi.getState().deleteSelected();
  };

  /** 置顶/置底：移到新建的最外层轨道（与画布右键菜单一致） */
  const menuReorder = (where: 'front' | 'back') => {
    const id = menuItemId.current;
    if (!id) return;
    editorApi
      .getState()
      .updateUndoable((s) => (where === 'front' ? bringToFront(s, id) : sendToBack(s, id)));
  };

  // 面板高度拖拽
  const onResizePointerDown = (e: React.PointerEvent) => {
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent) => setHeight(startH + (startY - ev.clientY));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // 顶部/底部新轨道目标时，渲染层插入一条虚拟空行（仅渲染，松手才真正建轨道）
  const virtualRowIndex =
    moveVisual && moveVisual.target.kind === 'insert' && !moveVisual.target.bar
      ? moveVisual.target.index
      : null;

  /** 当前布局的行高与前缀和（渲染层与所有覆盖物统一使用） */
  const rowHeights = undoable.tracks.map((t) => rowHeightOf(undoable, t.id));
  const tops = rowTops(undoable);

  const headerRows = undoable.tracks.map((t, i) => (
    <TrackHeader key={t.id} track={t} number={undoable.tracks.length - i} height={rowHeights[i]} />
  ));
  if (virtualRowIndex !== null) {
    headerRows.splice(
      virtualRowIndex,
      0,
      <div key="__virtual" className="border-b border-border/50" style={{ height: TRACK_HEIGHT }} />,
    );
  }

  /** 吸附线（移动或修剪） */
  const guideFrame = moveVisual?.guideFrame ?? trimGuide;
  const movingItem = moveVisual ? undoable.items[moveVisual.id] : null;

  return (
    <div
      ref={panelRef}
      className={cn('relative shrink-0 border-t border-border bg-card', className)}
      style={{ height }}
    >
      <div
        className="absolute -top-1 left-0 right-0 z-30 h-2 cursor-ns-resize"
        onPointerDown={onResizePointerDown}
      />
      <TimelineToolbar
        fps={undoable.fps}
        duration={duration}
        snapping={snapping}
        splittable={splittable}
        zoom={zoom}
        zoomSetting={zoomSetting}
        fitZoom={fitZoom}
        setZoom={setZoom}
        onToggleSnapping={() => editorApi.getState().toggleSnapping()}
        onSplit={() => {
          const store = editorApi.getState();
          const f = refs.getPlayerFrame();
          store.updateUndoable((s) => splitItemsAtFrame(s, f, resolveSplitTargets(s, f, store.selectedItemIds)));
        }}
        onFit={() => {
          setZoom('fit');
          if (scrollRef.current) scrollRef.current.scrollLeft = 0;
        }}
      />
      <div className="flex overflow-y-auto" style={{ height: `calc(100% - 2rem)` }}>
        <div className="shrink-0 border-r border-border" style={{ width: HEADER_WIDTH }}>
          <div style={{ height: RULER_HEIGHT }} />
          {headerRows}
        </div>
        <div ref={scrollRef} data-tl-scroll className="relative flex-1 overflow-x-auto">
          <ContextMenu>
            <ContextMenuTrigger
              onContextMenu={(e) => {
                // 仅命中块时弹菜单；空白区/标尺右键无菜单（官方）
                const id = (e.target as HTMLElement)
                  .closest('[data-item-block]')
                  ?.getAttribute('data-item-block');
                if (!id) {
                  e.preventDefault();
                  e.preventBaseUIHandler();
                  return;
                }
                // 右键先选中：已在多选中则保持多选，否则只选命中块
                const store = editorApi.getState();
                store.setSelected(
                  store.selectedItemIds.includes(id) ? store.selectedItemIds : [id],
                );
                menuItemId.current = id;
              }}
              render={
                <div
                  ref={contentRef}
                  className="relative"
                  style={{ width: contentWidth, minHeight: '100%' }}
                  onPointerDown={onBackgroundPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                />
              }
            >
            <Ruler durationInFrames={duration} fps={undoable.fps} zoom={zoom} onSeek={seekTo} />
            <TimelineTracks
              tracks={undoable.tracks}
              items={undoable.items}
              transitions={transitions}
              rowHeights={rowHeights}
              zoom={zoom}
              moveVisualId={moveVisual?.id ?? null}
              selectedTransitionId={selectedTransitionId}
              onItemPointerDown={onItemPointerDown}
              onRollPointerDown={onRollPointerDown}
              onTransitionPointerDown={onTransitionPointerDown}
              virtualRowIndex={virtualRowIndex}
            />
            <Playhead zoom={zoom} onSeek={seekTo} />
            <TimelineOverlays
              undoable={undoable}
              zoom={zoom}
              tops={tops}
              rowHeights={rowHeights}
              moveVisual={moveVisual}
              movingItem={movingItem}
              guideFrame={guideFrame}
              trimming={trimming}
              dropHint={dropHint}
              marqueeRect={marqueeRect}
            />
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={menuCut}>{t('timeline.cut')}</ContextMenuItem>
              <ContextMenuItem onClick={() => copySelection(editorApi)}>{t('timeline.copy')}</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateSelection(editorApi)}>{t('timeline.duplicate')}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => menuReorder('front')}>{t('timeline.bringToFront')}</ContextMenuItem>
              <ContextMenuItem onClick={() => menuReorder('back')}>{t('timeline.sendToBack')}</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </div>
      <TimelineGhost zoom={zoom} moveVisual={moveVisual} movingItem={movingItem} />
    </div>
  );
};
